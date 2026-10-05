// Turns database / Supabase errors into sentences a person can act on.
// Raw error objects are only logged in development.
const BY_CODE = {
  "campusdesk:not_allowed": "You don't have permission to do that.",
  "campusdesk:not_found": "That record could not be found.",
  "campusdesk:invalid_amount": "Enter an amount greater than zero.",
  "campusdesk:exceeds_remaining": "The amount is more than the remaining balance for this fee.",
  "campusdesk:already_paid": "This fee is already fully paid.",
  "campusdesk:pending_exists": "A payment for this fee is already awaiting verification.",
  "campusdesk:already_decided": "This payment has already been verified or rejected.",
  "campusdesk:not_pending": "This payment is no longer awaiting verification.",
  "campusdesk:no_receipt": "A receipt is only available for verified payments.",
  "campusdesk:fee_not_applicable": "This fee does not apply to the selected student.",
  "campusdesk:mode_required": "Choose how the payment was made.",
  "campusdesk:incomplete_results": "Some students have incomplete marks. Review the summary before publishing.",
  "campusdesk:no_subjects": "This class has no subjects yet, so results cannot be computed.",
  "campusdesk:invalid_dates": "The end date must be on or after the start date.",
  "campusdesk:leave_overlap": "You already have a leave request covering some of these dates.",
  "campusdesk:leave_too_old": "Leave cannot start more than 30 days in the past.",
  "campusdesk:class_conflict": "This class already has a period at that time.",
  "campusdesk:teacher_conflict": "That teacher is already teaching another class at that time.",
  "campusdesk:invalid_times": "The end time must be after the start time.",
  "campusdesk:future_date": "Attendance cannot be recorded for a future date.",
  "campusdesk:student_not_in_class": "One of the students does not belong to this class.",
  "campusdesk:role_locked": "Only an administrator can change roles.",
};
const BY_PG = {
  "23505": "That record already exists (duplicate value).",
  "23503": "This record is linked to other data and cannot be changed this way.",
  "23502": "A required field is missing.",
  "23514": "One of the values is not allowed.",
  "42501": "You don't have permission to do that.",
  PGRST301: "Your session has expired. Please log in again.",
};

export function friendlyError(err, fallback = "Something went wrong. Please try again.") {
  if (import.meta.env?.DEV && err) console.error("[CampusDesk]", err);
  const msg = String(err?.message || "");
  const key = Object.keys(BY_CODE).find((k) => msg.includes(k));
  if (key) return BY_CODE[key];
  if (/row-level security/i.test(msg)) return "You don't have permission to do that.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Unable to reach the server. Check your connection.";
  if (err?.code && BY_PG[err.code]) return BY_PG[err.code];
  return fallback;
}

/** Remaining balance carried by exceeds_remaining errors (error.details). */
export function errorDetail(err) {
  return err?.details || null;
}
