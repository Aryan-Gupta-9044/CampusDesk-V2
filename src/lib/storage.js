import { supabase } from "./supabaseClient";

export async function uploadAvatar(userId, file) {
  const ext = file.name.split(".").pop();
  const path = `${userId}/avatar.${ext}`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId);
  if (updateError) throw updateError;

  return publicUrl;
}

export async function uploadDocument(userId, file, category) {
  const prefix = category ? `${category}__` : "";
  const path = `${userId}/${prefix}${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("documents").upload(path, file);
  if (error) throw error;
  return path;
}

export async function listMyDocuments(userId) {
  const { data, error } = await supabase.storage.from("documents").list(userId, { sortBy: { column: "created_at", order: "desc" } });
  if (error) throw error;
  return (data || [])
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => {
      const match = f.name.match(/^([^_]+)__(.+)$/);
      return {
        ...f,
        path: `${userId}/${f.name}`,
        category: match ? match[1] : "Other",
        displayName: match ? match[2] : f.name,
      };
    });
}

export async function getDocumentUrl(path) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteDocument(path) {
  const { error } = await supabase.storage.from("documents").remove([path]);
  if (error) throw error;
}
