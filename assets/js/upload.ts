export interface UploadResult {
  success: true;
  mediaId: string;
  url: string;
}

export interface UploadError {
  success?: false;
  error: string;
}

export interface AvatarUploadResult {
  success: true;
  avatarUrl: string;
}

export async function uploadAvatar(
  file: File,
  csrfToken: string
): Promise<AvatarUploadResult | UploadError> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/upload/avatar", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken },
    body: formData,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    return { error: json.error ?? "Upload failed" };
  }
  return json as AvatarUploadResult;
}

export async function uploadFile(
  file: File,
  csrfToken: string
): Promise<UploadResult | UploadError> {
  const formData = new FormData();
  formData.append("file", file);
  // Do NOT set Content-Type — browser sets the multipart boundary automatically
  const res = await fetch("/upload", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken },
    body: formData,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    return { error: json.error ?? "Upload failed" };
  }
  return json as UploadResult;
}
