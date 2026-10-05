import React, { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { listEvents, createEvent, deleteEvent } from "../../lib/queries/events";
import { friendlyError } from "../../lib/errors";

const emptyForm = { title: "", description: "", eventDate: "", location: "" };

function Events() {
  const { role } = useAuth();
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const canPost = role === "admin" || role === "teacher";

  const load = async () => {
    setLoading(true);
    try {
      const data = await listEvents();
      setEvents(data);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.eventDate) {
      setError("Title and date are required.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await createEvent(form);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (event) => {
    if (!window.confirm(`Delete event "${event.title}"?`)) return;
    try {
      await deleteEvent(event.id);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>Events</h1>
          <p className="lede">Upcoming academic calendar, soonest first.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="lede">Loading…</p>
      ) : events.length === 0 ? (
        <p className="lede">No events scheduled.</p>
      ) : (
        <div className="student-list">
          {events.map((e) => (
            <div className="recent-row" key={e.id} style={{ alignItems: "flex-start" }}>
              <span className="student-summary">
                <strong>{e.title}</strong>
                <small>
                  {e.event_date} {e.location ? `· ${e.location}` : ""}
                </small>
                {e.description && <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "12px" }}>{e.description}</p>}
              </span>
              {role === "admin" && (
                <button className="delete-button" type="button" onClick={() => handleDelete(e)} title="Delete">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canPost && (
        <form onSubmit={handleSubmit} className="student-form" style={{ marginTop: "24px" }}>
          <p className="eyebrow">Create an event</p>
          <div className="form-grid">
            <label>
              Title
              <input name="title" value={form.title} onChange={handleChange} required />
            </label>
            <label>
              Date
              <input type="date" name="eventDate" value={form.eventDate} onChange={handleChange} required />
            </label>
            <label>
              Location
              <input name="location" value={form.location} onChange={handleChange} />
            </label>
          </div>
          <label style={{ display: "block", marginBottom: "12px" }}>
            Description
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              style={{ width: "100%", border: "1px solid var(--line)", padding: "10px", font: "13px Arial, sans-serif" }}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="button primary-button" disabled={creating}>
              {creating ? "Creating…" : "Create event"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default Events;
