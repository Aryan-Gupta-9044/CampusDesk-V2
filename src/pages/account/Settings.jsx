import React, { useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { updateMyProfile, updateMyPassword } from "../../lib/queries/account";
import { uploadAvatar } from "../../lib/storage";
import RoleStamp from "../../components/RoleStamp";

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function Settings() {
  const { user, profile, role, refreshProfile } = useAuth();

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const handleAvatarChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setAvatarError("");
    setAvatarUploading(true);
    try {
      await uploadAvatar(user.id, file);
      await refreshProfile();
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarUploading(false);
    }
  };

  const [profileForm, setProfileForm] = useState({
    fullName: profile?.full_name || "",
    phone: profile?.phone || "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [passwordForm, setPasswordForm] = useState({ password: "", confirmPassword: "" });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileSaved(false);
    setProfileSaving(true);
    try {
      await updateMyProfile(user.id, profileForm);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);
    if (passwordForm.password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    setPasswordSaving(true);
    try {
      await updateMyPassword(passwordForm.password);
      setPasswordForm({ password: "", confirmPassword: "" });
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Settings</h1>
          <p className="lede">{user?.email}</p>
        </div>
        <RoleStamp role={role} size="lg" />
      </div>

      <div className="student-form">
        <p className="eyebrow">Profile photo</p>
        {avatarError && <p className="form-error">{avatarError}</p>}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Avatar"
              style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <span className="avatar" style={{ width: "64px", height: "64px", fontSize: "22px" }}>
              {initials(profile?.full_name)}
            </span>
          )}
          <label className="button secondary-button" style={{ cursor: "pointer" }}>
            {avatarUploading ? "Uploading…" : "Change photo"}
            <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: "none" }} disabled={avatarUploading} />
          </label>
        </div>
      </div>

      <form onSubmit={handleProfileSubmit} className="student-form" style={{ marginTop: "24px" }}>
        <p className="eyebrow">Profile</p>
        {profileError && <p className="form-error">{profileError}</p>}
        <div className="form-grid">
          <label>
            Full name
            <input
              value={profileForm.fullName}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))}
              required
            />
          </label>
          <label>
            Phone
            <input
              value={profileForm.phone}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </label>
        </div>
        <div className="form-actions">
          {profileSaved && <span className="lede">Saved.</span>}
          <button className="button primary-button" type="submit" disabled={profileSaving}>
            {profileSaving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>

      <form onSubmit={handlePasswordSubmit} className="student-form" style={{ marginTop: "24px" }}>
        <p className="eyebrow">Change password</p>
        {passwordError && <p className="form-error">{passwordError}</p>}
        <div className="form-grid">
          <label>
            New password
            <input
              type="password"
              value={passwordForm.password}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              minLength={6}
              autoComplete="new-password"
            />
          </label>
        </div>
        <div className="form-actions">
          {passwordSaved && <span className="lede">Password updated.</span>}
          <button className="button primary-button" type="submit" disabled={passwordSaving}>
            {passwordSaving ? "Saving…" : "Update password"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Settings;
