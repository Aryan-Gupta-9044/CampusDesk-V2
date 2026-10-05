import { supabase } from "../supabaseClient";

export async function listEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, event_date, location, created_at")
    .order("event_date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createEvent({ title, description, eventDate, location }) {
  const { error } = await supabase.from("events").insert({
    title,
    description,
    event_date: eventDate,
    location,
  });
  if (error) throw error;
}

export async function deleteEvent(id) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}
