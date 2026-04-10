import React, { useState, useRef, useEffect, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readUser, updateProfile, buildCSRFHeaders } from "../ash_rpc";
import { uploadAvatar } from "../upload";
import { AuthCtx } from "../context";
import { getAssetHost } from "../utils";
import { Spinner } from "./ui";
import type { User } from "../types";

export function ProfileEditor({ userId }: { userId: string }) {
  const assetHost = getAssetHost();
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["user", userId],
    queryFn: async () => {
      const res = await readUser({
        fields: ["id", "email", "username", "displayName", "avatarUrl", "followerCount", "followingCount", "amIFollowing"],
        filter: { id: { eq: userId } },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error("Failed to load user");
      const results = Array.isArray(res.data) ? res.data : (res.data as any)?.results ?? [];
      return (results[0] as User) ?? null;
    },
  });

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username ?? "");
      setDisplayName(user.displayName ?? "");
    }
  }, [user?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await updateProfile({
        identity: userId,
        input: {
          username: username.trim() || null,
          displayName: displayName.trim() || null,
        },
        fields: ["id", "username", "displayName", "avatarUrl"],
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error((res.errors?.[0] as any)?.message ?? "Save failed");
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user", userId] });
      setSaveSuccess(true);
      setSaveError(null);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (previewAvatarUrl) URL.revokeObjectURL(previewAvatarUrl);
    setPreviewAvatarUrl(URL.createObjectURL(file));
    setAvatarError(null);
    setAvatarUploading(true);
    const csrfToken = buildCSRFHeaders()["X-CSRF-Token"] as string;
    const result = await uploadAvatar(file, csrfToken);
    setAvatarUploading(false);
    if ("error" in result) {
      setAvatarError(result.error);
      if (previewAvatarUrl) URL.revokeObjectURL(previewAvatarUrl);
      setPreviewAvatarUrl(null);
    } else {
      qc.invalidateQueries({ queryKey: ["user", userId] });
    }
  }

  if (isLoading || !user) return <Spinner />;

  const currentAvatarUrl = previewAvatarUrl
    ? previewAvatarUrl
    : user.avatarUrl
    ? `${assetHost}/${user.avatarUrl}`
    : null;

  return (
    <div className="mx-profile-editor">
      <div className="mx-profile-avatar-section">
        <div className="mx-profile-avatar-wrap">
          {currentAvatarUrl ? (
            <img src={currentAvatarUrl} alt="Your avatar" className="mx-profile-avatar-img" />
          ) : (
            <div className="mx-profile-avatar-placeholder">
              <span>{(user.displayName || user.username || user.email || "M")[0].toUpperCase()}</span>
            </div>
          )}
          <button
            className="mx-profile-avatar-edit-btn"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            title="Change avatar"
          >
            {avatarUploading ? (
              <div className="mx-spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1 1 0 0 0 0-1.41l-2.31-2.31a1 1 0 0 0-1.41 0l-1.79 1.79 3.75 3.75 1.76-1.82z" />
              </svg>
            )}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleAvatarChange}
          />
        </div>
        {avatarError && <p className="mx-compose-error" style={{ marginTop: "0.5rem" }}>{avatarError}</p>}
      </div>

      <div className="mx-profile-stats">
        <span><strong>{user.followerCount ?? 0}</strong> followers</span>
        <span><strong>{user.followingCount ?? 0}</strong> following</span>
      </div>

      <div className="mx-profile-field">
        <label className="mx-profile-label">Email</label>
        <input
          type="text"
          className="mx-profile-input mx-profile-input--readonly"
          value={String(user.email)}
          readOnly
        />
      </div>

      <div className="mx-profile-field">
        <label className="mx-profile-label">Display name</label>
        <input
          type="text"
          className="mx-profile-input"
          placeholder="Your display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
        />
      </div>

      <div className="mx-profile-field">
        <label className="mx-profile-label">Username</label>
        <div className="mx-profile-input-wrap">
          <span className="mx-profile-at">@</span>
          <input
            type="text"
            className="mx-profile-input mx-profile-input--handle"
            placeholder="your_handle"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
            maxLength={30}
          />
        </div>
        <p className="mx-profile-hint">3–30 characters. Letters, numbers, underscores only.</p>
      </div>

      {saveError && <p className="mx-compose-error">{saveError}</p>}
      {saveSuccess && <p style={{ fontSize: "0.8rem", color: "var(--mx-green)", marginBottom: "0.5rem" }}>✓ Saved!</p>}

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button
          className="mx-btn-post"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save changes"}
        </button>
        <a href="/sign-out" className="mx-btn-cancel" style={{ textDecoration: "none" }}>Sign out</a>
      </div>
    </div>
  );
}

export function MyProfile() {
  const { userId } = useContext(AuthCtx);

  if (!userId) {
    return (
      <div className="mx-empty">
        <div className="mx-empty-icon">◎</div>
        <p className="mx-empty-title">Your profile</p>
        <p className="mx-empty-sub">
          <a href="/sign-in" style={{ color: "var(--mx-accent)", textDecoration: "none" }}>Sign in</a>
          {" "}to view your profile.
        </p>
      </div>
    );
  }

  return <ProfileEditor userId={userId} />;
}
