-- =====================================================================
-- 002_v2_fee_integrity.sql           SAFE FOR EXISTING V1 DATABASES
-- Database-level payment rules. The database is the final authority:
--   * no zero / negative payments            * no overpayment
--   * no payment once fully paid             * one pending request per student+fee
--   * no double verification                 * race-safe (advisory locks)
-- Confirmed (paid/partial) rows are immutable once decided.
-- Existing rows are never modified except the safe backfill of reference_note.
-- =====================================================================

-- @@SCHEMA
alter table public.fee_payments add column if not exists reference_note   text;
alter table public.fee_payments add column if not exists submitted_by     uuid references public.profiles(id) on delete set null;
alter table public.fee_payments add column if not exists verified_by      uuid references public.profiles(id) on delete set null;
alter table public.fee_payments add column if not exists verified_at      timestamptz;
alter table public.fee_payments add column if not exists rejection_reason text;
alter table public.fee_payments add column if not exists created_at       timestamptz not null default now();

-- V1 stored the student's free-text note in receipt_no. Copy it (do not erase it) so
-- receipt_no can mean "official receipt number" from now on.
update public.fee_payments
   set reference_note = receipt_no
 where reference_note is null and receipt_no is not null and status in ('pending_verification','rejected');

create sequence if not exists public.fee_receipt_seq;

-- At most one pending request per student + fee. If V1 data already violates this we do NOT fail:
-- we skip the index and tell you which rows to resolve.
do $$
begin
  if exists (select 1 from pg_indexes where indexname = 'uq_fee_one_pending') then
    return;
  end if;
  if exists (select 1 from public.fee_payments where status = 'pending_verification'
             group by student_id, fee_structure_id having count(*) > 1) then
    raise warning 'uq_fee_one_pending NOT created: duplicate pending payments exist. Resolve them (verify/reject extras) and re-run this migration.';
  else
    create unique index uq_fee_one_pending on public.fee_payments (student_id, fee_structure_id)
      where status = 'pending_verification';
  end if;
end $$;

-- NOT VALID = enforced for new/changed rows, existing V1 rows are not re-checked.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fee_payments_amount_sane') then
    alter table public.fee_payments add constraint fee_payments_amount_sane
      check (amount_paid >= 0 and (status = 'due' or amount_paid > 0)) not valid;
  end if;
end $$;

create index if not exists idx_fee_payments_lookup on public.fee_payments(student_id, fee_structure_id, status);

-- @@FUNCTIONS
create or replace function public.next_receipt_no()
returns text language sql volatile as $$
  select 'RCPT-' || to_char(now(), 'YYYY') || '-' || to_char(nextval('public.fee_receipt_seq'), 'FM000000');
$$;

-- Single source of truth for per-fee numbers. Only CONFIRMED payments reduce the balance.
create or replace function public.get_fee_summary(p_student uuid)
returns table (
  fee_structure_id uuid, fee_type text, amount numeric, due_date date,
  confirmed_paid numeric, pending_amount numeric, remaining numeric, status text, can_pay boolean,
  pending_payment_id uuid, pending_date date, pending_mode text, pending_reference text,
  last_rejection_reason text, last_rejected_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (auth.uid() = p_student or public.is_admin() or public.is_parent_of(p_student)) then
    raise exception 'campusdesk:not_allowed' using errcode = '42501';
  end if;
  return query
  select fs.id, fs.fee_type, fs.amount, fs.due_date,
         c.confirmed, coalesce(pd.amount_paid, 0), greatest(fs.amount - c.confirmed, 0),
         case
           when fs.amount - c.confirmed <= 0 then 'paid'
           when pd.id is not null then 'pending_verification'
           when c.confirmed > 0 then 'partial'
           when rj.id is not null then 'rejected'
           else 'due'
         end,
         (fs.amount - c.confirmed > 0 and pd.id is null),
         pd.id, pd.payment_date, pd.mode, pd.reference_note,
         rj.rejection_reason, rj.verified_at
  from public.students s
  join public.fee_structure fs on fs.class_id = s.class_id
  cross join lateral (
    select coalesce(sum(p.amount_paid), 0) as confirmed
    from public.fee_payments p
    where p.student_id = s.id and p.fee_structure_id = fs.id and p.status in ('paid','partial')
  ) c
  left join lateral (
    select p.* from public.fee_payments p
    where p.student_id = s.id and p.fee_structure_id = fs.id and p.status = 'pending_verification'
    order by p.created_at desc limit 1
  ) pd on true
  left join lateral (
    select p.* from public.fee_payments p
    where p.student_id = s.id and p.fee_structure_id = fs.id and p.status = 'rejected'
    order by coalesce(p.verified_at, p.created_at) desc limit 1
  ) rj on true
  where s.id = p_student
  order by fs.due_date nulls last, fs.fee_type;
end $$;

-- Student or parent submits a payment claim -> pending_verification
create or replace function public.submit_fee_payment(
  p_student uuid, p_fee uuid, p_amount numeric, p_mode text, p_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (auth.uid() = p_student or public.is_parent_of(p_student)) then
    raise exception 'campusdesk:not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students s join public.fee_structure f on f.class_id = s.class_id
                 where s.id = p_student and f.id = p_fee) then
    raise exception 'campusdesk:fee_not_applicable' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_mode), '') = '' then
    raise exception 'campusdesk:mode_required' using errcode = 'P0001';
  end if;
  insert into public.fee_payments (student_id, fee_structure_id, amount_paid, payment_date, mode,
                                   status, reference_note, submitted_by)
  values (p_student, p_fee, round(p_amount, 2), current_date, trim(p_mode),
          'pending_verification', nullif(trim(coalesce(p_reference, '')), ''), auth.uid())
  returning id into v_id;   -- fee_payments_guard() enforces amount/overpay/duplicate rules
  return v_id;
end $$;

create or replace function public.verify_fee_payment(p_payment uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.fee_payments;
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  select * into r from public.fee_payments where id = p_payment for update;
  if not found then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  if r.status <> 'pending_verification' then raise exception 'campusdesk:not_pending' using errcode = 'P0001'; end if;
  update public.fee_payments
     set status = 'paid',                      -- guard trigger normalises to paid/partial
         verified_by = auth.uid(), verified_at = now(), receipt_no = public.next_receipt_no()
   where id = p_payment returning * into r;
  insert into public.audit_logs (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'verify_fee_payment', 'fee_payments', r.id,
          jsonb_build_object('amount', r.amount_paid, 'receipt', r.receipt_no, 'status', r.status));
  return jsonb_build_object('id', r.id, 'status', r.status, 'receipt_no', r.receipt_no);
end $$;

create or replace function public.reject_fee_payment(p_payment uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.fee_payments;
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  select * into r from public.fee_payments where id = p_payment for update;
  if not found then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  if r.status <> 'pending_verification' then raise exception 'campusdesk:not_pending' using errcode = 'P0001'; end if;
  update public.fee_payments
     set status = 'rejected', rejection_reason = nullif(trim(coalesce(p_reason, '')), ''),
         verified_by = auth.uid(), verified_at = now()
   where id = p_payment returning * into r;
  insert into public.audit_logs (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'reject_fee_payment', 'fee_payments', r.id,
          jsonb_build_object('amount', r.amount_paid, 'reason', r.rejection_reason));
  return jsonb_build_object('id', r.id, 'status', r.status);
end $$;

-- Admin records an offline (cash/cheque) payment that is already confirmed.
create or replace function public.admin_record_payment(
  p_student uuid, p_fee uuid, p_amount numeric, p_mode text, p_reference text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.fee_payments;
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  insert into public.fee_payments (student_id, fee_structure_id, amount_paid, payment_date, mode, status,
                                   reference_note, submitted_by, verified_by, verified_at, receipt_no, recorded_by)
  values (p_student, p_fee, round(p_amount, 2), current_date, coalesce(nullif(trim(p_mode), ''), 'cash'), 'paid',
          nullif(trim(coalesce(p_reference, '')), ''), auth.uid(), auth.uid(), now(), public.next_receipt_no(), auth.uid())
  returning * into r;
  insert into public.audit_logs (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'record_fee_payment', 'fee_payments', r.id,
          jsonb_build_object('amount', r.amount_paid, 'receipt', r.receipt_no));
  return jsonb_build_object('id', r.id, 'status', r.status, 'receipt_no', r.receipt_no);
end $$;

-- Official receipt data. Only for confirmed payments.
create or replace function public.get_payment_receipt(p_payment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.fee_payments; v jsonb;
begin
  select * into r from public.fee_payments where id = p_payment;
  if not found then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  if not (auth.uid() = r.student_id or public.is_admin() or public.is_parent_of(r.student_id)) then
    raise exception 'campusdesk:not_allowed' using errcode = '42501';
  end if;
  if r.status not in ('paid','partial') or r.receipt_no is null then
    raise exception 'campusdesk:no_receipt' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'receipt_no', r.receipt_no, 'amount', r.amount_paid, 'payment_date', r.payment_date, 'mode', r.mode,
    'reference', r.reference_note, 'verified_at', r.verified_at,
    'verified_by', (select full_name from public.profiles where id = r.verified_by),
    'student_name', sp.full_name, 'roll_no', s.roll_no,
    'class', c.name || '-' || c.section, 'academic_year', c.academic_year,
    'fee_type', f.fee_type, 'fee_amount', f.amount)
  into v
  from public.students s
  join public.profiles sp on sp.id = s.id
  left join public.classes c on c.id = s.class_id
  left join public.fee_structure f on f.id = r.fee_structure_id
  where s.id = r.student_id;
  return v;
end $$;

-- @@TRIGGERS
create or replace function public.fee_payments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fee numeric; v_confirmed numeric; v_remaining numeric;
begin
  if new.fee_structure_id is null then
    if tg_op = 'INSERT' and new.status <> 'due' then raise exception 'campusdesk:fee_required' using errcode = 'P0001'; end if;
    return new;
  end if;
  -- serialise all writes for the same student+fee: this is what makes concurrent requests safe
  perform pg_advisory_xact_lock(hashtextextended(new.student_id::text || ':' || new.fee_structure_id::text, 0));

  if tg_op = 'UPDATE' then
    if new.student_id is distinct from old.student_id or new.fee_structure_id is distinct from old.fee_structure_id then
      raise exception 'campusdesk:immutable' using errcode = 'P0001';
    end if;
    -- decided payments are final (blocks double verification and silent edits)
    if old.status in ('paid','partial','rejected')
       and (new.status is distinct from old.status or new.amount_paid is distinct from old.amount_paid) then
      raise exception 'campusdesk:already_decided' using errcode = 'P0001';
    end if;
    if old.status = 'pending_verification' and new.amount_paid is distinct from old.amount_paid then
      raise exception 'campusdesk:immutable' using errcode = 'P0001';
    end if;
  end if;

  if new.status <> 'due' and (new.amount_paid is null or new.amount_paid <= 0) then
    raise exception 'campusdesk:invalid_amount' using errcode = 'P0001';
  end if;

  if new.status in ('paid','partial','pending_verification')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select amount into v_fee from public.fee_structure where id = new.fee_structure_id;
    select coalesce(sum(amount_paid), 0) into v_confirmed from public.fee_payments
     where student_id = new.student_id and fee_structure_id = new.fee_structure_id
       and status in ('paid','partial') and id is distinct from new.id;
    v_remaining := v_fee - v_confirmed;
    if v_remaining <= 0 then raise exception 'campusdesk:already_paid' using errcode = 'P0001'; end if;
    if new.amount_paid > v_remaining then
      raise exception 'campusdesk:exceeds_remaining' using errcode = 'P0001', detail = v_remaining::text;
    end if;
    if new.status = 'pending_verification' and exists (
         select 1 from public.fee_payments where student_id = new.student_id
            and fee_structure_id = new.fee_structure_id and status = 'pending_verification' and id is distinct from new.id) then
      raise exception 'campusdesk:pending_exists' using errcode = 'P0001';
    end if;
    if new.status in ('paid','partial') then
      new.status := case when v_confirmed + new.amount_paid >= v_fee then 'paid' else 'partial' end;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists fee_payments_guard on public.fee_payments;
create trigger fee_payments_guard before insert or update on public.fee_payments
  for each row execute procedure public.fee_payments_guard();
