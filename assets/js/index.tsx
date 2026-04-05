import React, { createContext, useContext, useState, useRef, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createTweet,
  readTweet,
  destroyTweet,
  likeTweet,
  unlikeTweet,
  updateTweet,
  readUser,
  followUser,
  unfollowUser,
  buildCSRFHeaders,
} from "./ash_rpc";
import { uploadFile } from "./upload";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000 } },
});

// ── Types ──────────────────────────────────────────────────────────────────────

type User = {
  id: string;
  email: string;
  followerCount?: number;
  followingCount?: number;
  amIFollowing?: boolean;
  myFollowId?: string | null;
};
type MediaItem = { id: string; s3Key: string };
type Tweet = {
  id: string;
  content: string;
  likes: number;
  likedByMe?: boolean;
  userId: string;
  state: string;
  media?: MediaItem[];
  userEmail?: string | null;
  insertedAt?: string | null;
};

// ── Auth context ───────────────────────────────────────────────────────────────

const AuthCtx = createContext({ email: "", userId: "" });

// ── Responsive helper ─────────────────────────────────────────────────────────
// Returns true when the viewport is wider than 960 px (desktop layout).
// Uses useSyncExternalStore so it re-renders on resize without a manual
// useEffect + useState dance.

const DESKTOP_MQ = typeof window !== "undefined"
  ? window.matchMedia("(min-width: 961px)")
  : null;

function subscribe(cb: () => void) {
  DESKTOP_MQ?.addEventListener("change", cb);
  return () => DESKTOP_MQ?.removeEventListener("change", cb);
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => DESKTOP_MQ?.matches ?? true,
    () => true, // SSR snapshot (never actually used here)
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(insertedAt?: string | null): string {
  if (!insertedAt) return "just now";
  const now = Date.now();
  const then = new Date(insertedAt).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(insertedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getAssetHost(): string {
  const appEl = document.getElementById("app");
  return appEl?.dataset.assetHost ?? "http://localhost:9000";
}

// ── Context menu ──────────────────────────────────────────────────────────────

type ContextMenuItem =
  | { type: "item"; label: string; onClick: () => void }
  | { type: "separator" };

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const itemCount = items.filter((i) => i.type === "item").length;
  const sepCount = items.filter((i) => i.type === "separator").length;
  const menuH = itemCount * 34 + sepCount * 9 + 8;
  const menuW = 180;
  const left = Math.min(x, window.innerWidth - menuW - 8);
  const top = Math.min(y, window.innerHeight - menuH - 8);

  return createPortal(
    <div
      ref={ref}
      className="mx-context-menu"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.type === "separator" ? (
          <div key={i} className="mx-context-menu-separator" />
        ) : (
          <button
            key={i}
            className="mx-context-menu-item"
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

// ── Components ─────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
      <div className="mx-spinner" />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mx-error-banner">
      <span className="mx-error-icon">⚠</span>
      {message}
    </div>
  );
}

function CharCount({ current, max }: { current: number; max: number }) {
  const remaining = max - current;
  const pct = current / max;
  const color =
    pct > 0.9 ? "#ef4444" : pct > 0.75 ? "#f59e0b" : "var(--mx-muted)";
  return (
    <span style={{ color, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
      {remaining}
    </span>
  );
}

function ComposeTweet({ onSuccess }: { onSuccess?: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const MAX = 280;

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await createTweet({
        input: { content, mediaId: mediaId ?? undefined },
        fields: ["id", "content", "userId", "state"],
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed");
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tweets"] });
      setText("");
      setError(null);
      setMediaId(null);
      setPendingFile(null);
      setUploadError(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      onSuccess?.();
    },
    onError: (e: Error) => setError(e.message),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so the same file can be re-selected after removal
    e.target.value = "";
    // Revoke any previous object URL to avoid memory leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const localUrl = URL.createObjectURL(file);
    setPendingFile(file);
    setPreviewUrl(localUrl);
    setMediaId(null);
    setUploadError(null);
    setUploading(true);
    const csrfToken = buildCSRFHeaders()["X-CSRF-Token"] as string;
    const result = await uploadFile(file, csrfToken);
    setUploading(false);
    if ("error" in result) {
      setUploadError(result.error);
      setPendingFile(null);
      URL.revokeObjectURL(localUrl);
      setPreviewUrl(null);
    } else {
      setMediaId(result.mediaId);
    }
  }

  function removeAttachment() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
    setMediaId(null);
    setUploadError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX) {
      setError(`Max ${MAX} characters`);
      return;
    }
    setError(null);
    mutation.mutate(trimmed);
  }

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  return (
    <div className="mx-compose">
      <div className="mx-compose-avatar">
        <span>M</span>
      </div>
      <div className="mx-compose-body">
        <textarea
          ref={textareaRef}
          className="mx-compose-textarea"
          placeholder="What's mixing?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          maxLength={MAX + 1}
        />
        {previewUrl && pendingFile && (
          <div style={{ position: "relative", marginTop: "0.5rem", display: "inline-block" }}>
            {/\.(mp4|mov)$/i.test(pendingFile.name) ? (
              <video
                src={previewUrl}
                controls
                style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "0.5rem", display: "block" }}
              />
            ) : (
              <img
                src={previewUrl}
                alt="attachment preview"
                style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "0.5rem", display: "block" }}
              />
            )}
            {uploading && (
              <div style={{
                position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
                borderRadius: "0.5rem", display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: "0.75rem"
              }}>
                Uploading…
              </div>
            )}
            <button
              type="button"
              onClick={removeAttachment}
              style={{
                position: "absolute", top: "4px", right: "4px",
                background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%",
                width: "20px", height: "20px", cursor: "pointer",
                color: "#fff", fontSize: "12px", lineHeight: 1,
                display: "flex", alignItems: "center", justifyContent: "center"
              }}
              title="Remove attachment"
            >
              ×
            </button>
          </div>
        )}
        {uploadError && <p className="mx-compose-error">{uploadError}</p>}
        {error && <p className="mx-compose-error">{error}</p>}
        <div className="mx-compose-footer">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              className="mx-action-btn"
              title="Attach image or video"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || mutation.isPending}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/mp4,video/quicktime"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {uploading && (
              <span style={{ fontSize: "0.75rem", color: "var(--mx-muted)" }}>
                {pendingFile?.name}
              </span>
            )}
          </div>
          <div className="mx-compose-actions">
            <CharCount current={text.length} max={MAX} />
            <button
              className="mx-btn-post"
              onClick={submit}
              disabled={!text.trim() || mutation.isPending || uploading}
            >
              {mutation.isPending ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TweetMedia({ media }: { media: MediaItem[] }) {
  const assetHost = getAssetHost();
  return (
    <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {media.map((m) =>
        /\.(mp4|mov)$/i.test(m.s3Key) ? (
          <video
            key={m.id}
            src={`${assetHost}/${m.s3Key}`}
            controls
            style={{ maxWidth: "100%", borderRadius: "0.5rem" }}
          />
        ) : (
          <img
            key={m.id}
            src={`${assetHost}/${m.s3Key}`}
            alt=""
            style={{ maxWidth: "100%", borderRadius: "0.5rem", display: "block" }}
          />
        )
      )}
    </div>
  );
}

function TweetCard({ tweet }: { tweet: Tweet }) {
  const { userId: currentUserId } = useContext(AuthCtx);
  const canModify = !!currentUserId && tweet.userId === currentUserId;
  const canLike = !!currentUserId;

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(tweet.content);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const qc = useQueryClient();

  const tweetUrl = `${window.location.origin}/feed/${tweet.id}`;

  const ctxItems: ContextMenuItem[] = canModify
    ? [
        {
          type: "item",
          label: "Edit",
          onClick: () => {
            setEditText(tweet.content);
            setEditing(true);
            setConfirmDelete(false);
          },
        },
        { type: "separator" },
        {
          type: "item",
          label: "Share",
          onClick: () => navigator.clipboard.writeText(tweetUrl),
        },
      ]
    : [
        {
          type: "item",
          label: "View",
          onClick: () => { window.location.href = tweetUrl; },
        },
        { type: "separator" },
        {
          type: "item",
          label: "Share",
          onClick: () => navigator.clipboard.writeText(tweetUrl),
        },
      ];

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await destroyTweet({
        identity: tweet.id,
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tweets"] }),
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await updateTweet({
        identity: tweet.id,
        input: { content },
        fields: ["id", "content", "userId", "state"],
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed to update");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tweets"] });
      setEditing(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      const action = tweet.likedByMe ? unlikeTweet : likeTweet;
      const res = await action({
        identity: tweet.id,
        fields: ["id", "likes", "likedByMe"],
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed to update like");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tweets"] });
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed) return;
    updateMutation.mutate(trimmed);
  }

  return (
    <article
      className="mx-tweet"
      style={{ cursor: "pointer" }}
      onClick={() => { window.location.href = `/feed/${tweet.id}`; }}
      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      <div className="mx-tweet-avatar">
        <span>M</span>
      </div>
      <div className="mx-tweet-body">
        <div className="mx-tweet-header">
          <span className="mx-tweet-handle">{tweet.userEmail ?? "@mixer"}</span>
          <span className="mx-tweet-dot">·</span>
          <span className="mx-tweet-time" title={tweet.insertedAt ? new Date(tweet.insertedAt).toLocaleString() : undefined}>{timeAgo(tweet.insertedAt)}</span>
          {canModify && (
            <div className="mx-tweet-actions">
              <button
                className="mx-action-btn"
                title="Edit"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditText(tweet.content);
                  setEditing(true);
                  setConfirmDelete(false);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1 1 0 0 0 0-1.41l-2.31-2.31a1 1 0 0 0-1.41 0l-1.79 1.79 3.75 3.75 1.76-1.82z" />
                </svg>
              </button>
              <button
                className={`mx-action-btn mx-action-delete${confirmDelete ? " mx-action-confirm" : ""}`}
                title={confirmDelete ? "Confirm delete" : "Delete"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    setTimeout(() => setConfirmDelete(false), 3000);
                  } else {
                    deleteMutation.mutate();
                  }
                }}
              >
                {deleteMutation.isPending ? (
                  <span style={{ fontSize: "0.65rem" }}>…</span>
                ) : confirmDelete ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="mx-edit-area">
            <textarea
              className="mx-edit-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
              rows={3}
            />
            {error && <p className="mx-compose-error">{error}</p>}
            <div className="mx-edit-footer">
              <button
                className="mx-btn-cancel"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                className="mx-btn-save"
                onClick={saveEdit}
                disabled={!editText.trim() || updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <p className="mx-tweet-text">{tweet.content}</p>
        )}

        {tweet.media && tweet.media.length > 0 && (
          <TweetMedia media={tweet.media} />
        )}

        <div className="mx-tweet-footer">
          <button
            className={`mx-like-btn${tweet.likedByMe ? " mx-like-btn-active" : ""}`}
            onClick={(e) => { e.stopPropagation(); likeMutation.mutate(); }}
            disabled={!canLike || likeMutation.isPending}
            title={
              canLike
                ? tweet.likedByMe
                  ? "Remove like"
                  : "Like post"
                : "Sign in to like posts"
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.1 21.35 10.55 19.93C5.4 15.27 2 12.19 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.69-3.4 6.77-8.55 11.44z" />
            </svg>
            <span>{tweet.likes}</span>
          </button>
        </div>

        {error && !editing && <p className="mx-compose-error">{error}</p>}
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </article>
  );
}

function MediaLightbox({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const assetHost = getAssetHost();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div className="mx-lightbox" onClick={onClose}>
      <button className="mx-lightbox-close" onClick={onClose}>✕</button>
      <div className="mx-lightbox-content" onClick={(e) => e.stopPropagation()}>
        {/\.(mp4|mov)$/i.test(item.s3Key) ? (
          <video src={`${assetHost}/${item.s3Key}`} controls autoPlay className="mx-lightbox-media" />
        ) : (
          <img src={`${assetHost}/${item.s3Key}`} alt="" className="mx-lightbox-media" />
        )}
      </div>
    </div>,
    document.body
  );
}

function TweetDetail({ tweetId }: { tweetId: string }) {
  const { userId: currentUserId } = useContext(AuthCtx);
  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const assetHost = getAssetHost();

  const { data: tweet, isLoading, isError } = useQuery({
    queryKey: ["tweet", tweetId],
    queryFn: async () => {
      const res = await readTweet({
        fields: ["id", "content", "likes", "likedByMe", "userId", "state", "userEmail", "insertedAt", { media: ["id", "s3Key"] }],
        filter: { id: { eq: tweetId } },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error("Failed to load tweet");
      const results = Array.isArray(res.data) ? res.data : (res.data as any)?.results ?? [];
      return (results[0] as Tweet) ?? null;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await destroyTweet({ identity: tweetId, headers: buildCSRFHeaders() });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed to delete");
    },
    onSuccess: () => { window.location.href = "/feed"; },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await updateTweet({
        identity: tweetId,
        input: { content },
        fields: ["id", "content", "userId", "state"],
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed to update");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tweet", tweetId] });
      setEditing(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (!tweet) return;
      const action = tweet.likedByMe ? unlikeTweet : likeTweet;
      const res = await action({ identity: tweetId, fields: ["id", "likes", "likedByMe"], headers: buildCSRFHeaders() });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed to update like");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tweet", tweetId] }),
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) return <Spinner />;
  if (isError || !tweet) return <ErrorBanner message="Could not load tweet" />;

  const canModify = !!currentUserId && tweet.userId === currentUserId;
  const canLike = !!currentUserId;

  return (
    <div className="mx-detail">
      <div className="mx-detail-header">
        <a href="/feed" className="mx-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          Back
        </a>
        {canModify && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="mx-action-btn"
              title="Edit"
              onClick={() => { setEditText(tweet.content); setEditing(true); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1 1 0 0 0 0-1.41l-2.31-2.31a1 1 0 0 0-1.41 0l-1.79 1.79 3.75 3.75 1.76-1.82z" />
              </svg>
            </button>
            <button
              className={`mx-action-btn mx-action-delete${confirmDelete ? " mx-action-confirm" : ""}`}
              title={confirmDelete ? "Confirm delete" : "Delete"}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 3000);
                } else {
                  deleteMutation.mutate();
                }
              }}
            >
              {deleteMutation.isPending ? (
                <span style={{ fontSize: "0.65rem" }}>…</span>
              ) : confirmDelete ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="mx-detail-body">
        <div className="mx-detail-author">
          <div className="mx-tweet-avatar">
            <span>M</span>
          </div>
          <span className="mx-tweet-handle">{tweet.userEmail ?? "@mixer"}</span>
        </div>

        {editing ? (
          <div className="mx-edit-area">
            <textarea
              className="mx-edit-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
              rows={4}
            />
            {error && <p className="mx-compose-error">{error}</p>}
            <div className="mx-edit-footer">
              <button className="mx-btn-cancel" onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
              <button
                className="mx-btn-save"
                onClick={() => { const t = editText.trim(); if (t) updateMutation.mutate(t); }}
                disabled={!editText.trim() || updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <p className="mx-detail-content">{tweet.content}</p>
        )}

        {tweet.media && tweet.media.length > 0 && (
          <div className="mx-detail-media">
            {tweet.media.map((m) => (
              <button key={m.id} className="mx-media-thumb" onClick={() => setLightboxItem(m)}>
                {/\.(mp4|mov)$/i.test(m.s3Key) ? (
                  <video src={`${assetHost}/${m.s3Key}`} />
                ) : (
                  <img src={`${assetHost}/${m.s3Key}`} alt="" />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mx-tweet-footer" style={{ marginTop: "1rem" }}>
          <button
            className={`mx-like-btn${tweet.likedByMe ? " mx-like-btn-active" : ""}`}
            onClick={() => likeMutation.mutate()}
            disabled={!canLike || likeMutation.isPending}
            title={canLike ? (tweet.likedByMe ? "Remove like" : "Like post") : "Sign in to like posts"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.1 21.35 10.55 19.93C5.4 15.27 2 12.19 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.69-3.4 6.77-8.55 11.44z" />
            </svg>
            <span>{tweet.likes}</span>
          </button>
        </div>

        {error && !editing && <p className="mx-compose-error">{error}</p>}
      </div>

      {lightboxItem && <MediaLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />}
    </div>
  );
}

const FEED_PAGE_SIZE = 10;

function Feed() {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["tweets"],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await readTweet({
        fields: ["id", "content", "likes", "likedByMe", "userId", "state", "userEmail", "insertedAt", { media: ["id", "s3Key"] }],
        sort: "-insertedAt",
        page: { limit: FEED_PAGE_SIZE, offset: pageParam },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error("Failed to load tweets");
      const pageData = res.data as any;
      const tweets: Tweet[] = Array.isArray(pageData) ? pageData : (pageData?.results ?? []);
      const hasMore: boolean = Array.isArray(pageData) ? false : (pageData?.hasMore ?? false);
      return { tweets, hasMore, nextOffset: pageParam + FEED_PAGE_SIZE };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
  });

  // IntersectionObserver — fires fetchNextPage when the sentinel div scrolls into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <Spinner />;
  if (isError) {
    return (
      <ErrorBanner message={(error as Error)?.message ?? "Could not load tweets"} />
    );
  }

  const tweets = data?.pages.flatMap((p) => p.tweets) ?? [];

  if (tweets.length === 0) {
    return (
      <div className="mx-empty">
        <div className="mx-empty-icon">◎</div>
        <p className="mx-empty-title">Nothing posted yet</p>
        <p className="mx-empty-sub">Be the first to mix something in.</p>
      </div>
    );
  }

  return (
    <div className="mx-feed">
      {tweets.map((t) => (
        <TweetCard key={t.id} tweet={t} />
      ))}
      {/* Sentinel element — entering the viewport triggers loading the next page */}
      <div ref={sentinelRef} style={{ height: "1px" }} />
      {isFetchingNextPage && <Spinner />}
    </div>
  );
}

function RefreshButton() {
  const qc = useQueryClient();
  const [spinning, setSpinning] = useState(false);
  async function refresh() {
    setSpinning(true);
    await qc.invalidateQueries({ queryKey: ["tweets"] });
    setTimeout(() => setSpinning(false), 600);
  }
  return (
    <button className="mx-refresh-btn" onClick={refresh} title="Refresh feed">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{
          transition: "transform 0.6s ease",
          transform: spinning ? "rotate(360deg)" : "rotate(0deg)",
        }}
      >
        <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
      </svg>
    </button>
  );
}

function useFollowUser(targetUserId: string) {
  const qc = useQueryClient();

  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await followUser({
        input: { followingId: targetUserId },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error((res.errors?.[0] as any)?.message ?? "Follow failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user", targetUserId] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const res = await unfollowUser({
        input: { followingId: targetUserId },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error((res.errors?.[0] as any)?.message ?? "Unfollow failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user", targetUserId] });
    },
  });

  return {
    follow: () => followMutation.mutate(),
    unfollow: () => unfollowMutation.mutate(),
    isPending: followMutation.isPending || unfollowMutation.isPending,
  };
}

function FollowButton({ amIFollowing, isPending, onToggle }: { amIFollowing: boolean; isPending: boolean; onToggle: () => void }) {
  return (
    <button
      className={`mx-follow-btn${amIFollowing ? " mx-follow-btn--following" : ""}`}
      disabled={isPending}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      {isPending ? "…" : amIFollowing ? "Unfollow" : "Follow"}
    </button>
  );
}

function UserCard({ user }: { user: User }) {
  const { userId: currentUserId } = useContext(AuthCtx);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const { follow, unfollow, isPending } = useFollowUser(user.id);

  const userUrl = `${window.location.origin}/users/${user.id}`;
  const canFollow = !!currentUserId && currentUserId !== user.id;
  const amIFollowing = user.amIFollowing ?? false;

  const ctxItems: ContextMenuItem[] = [
    { type: "item", label: "Share", onClick: () => navigator.clipboard.writeText(userUrl) },
    ...(canFollow ? [
      { type: "separator" as const },
      amIFollowing
        ? { type: "item" as const, label: "Unfollow", onClick: unfollow }
        : { type: "item" as const, label: "Follow", onClick: follow },
    ] : []),
  ];

  return (
    <article
      className="mx-tweet"
      style={{ cursor: "pointer" }}
      onClick={() => { window.location.href = `/users/${user.id}`; }}
      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      <div className="mx-tweet-avatar">
        <span>M</span>
      </div>
      <div className="mx-tweet-body">
        <div className="mx-tweet-header">
          <span className="mx-tweet-handle">{user.email}</span>
        </div>
        {(user.followerCount !== undefined || user.followingCount !== undefined) && (
          <div className="mx-tweet-meta" style={{ fontSize: "0.8rem", color: "var(--mx-muted)", marginTop: "4px" }}>
            <span>{user.followerCount ?? 0} followers</span>
            <span style={{ marginLeft: "12px" }}>{user.followingCount ?? 0} following</span>
          </div>
        )}
      </div>
      {canFollow && (
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <FollowButton amIFollowing={amIFollowing} isPending={isPending} onToggle={amIFollowing ? unfollow : follow} />
        </div>
      )}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />
      )}
    </article>
  );
}

function UserList() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await readUser({
        fields: ["id", "email", "followerCount", "followingCount", "amIFollowing"],
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error("Failed to load users");
      const users = Array.isArray(res.data) ? res.data : (res.data as any)?.results ?? [];
      return users as User[];
    },
  });

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorBanner message={(error as Error)?.message ?? "Could not load users"} />;

  const users = data ?? [];

  if (users.length === 0) {
    return (
      <div className="mx-empty">
        <div className="mx-empty-icon">◎</div>
        <p className="mx-empty-title">No users yet</p>
        <p className="mx-empty-sub">Be the first to sign up.</p>
      </div>
    );
  }

  return (
    <div className="mx-feed">
      {users.map((u) => (
        <UserCard key={u.id} user={u} />
      ))}
    </div>
  );
}

function UserDetail({ userId }: { userId: string }) {
  const { userId: currentUserId } = useContext(AuthCtx);
  const { follow, unfollow, isPending } = useFollowUser(userId);
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ["user", userId],
    queryFn: async () => {
      const res = await readUser({
        fields: ["id", "email", "followerCount", "followingCount", "amIFollowing"],
        filter: { id: { eq: userId } },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error("Failed to load user");
      const results = Array.isArray(res.data) ? res.data : (res.data as any)?.results ?? [];
      return (results[0] as User) ?? null;
    },
  });

  if (isLoading) return <Spinner />;
  if (isError || !user) return <ErrorBanner message="Could not load user" />;

  const canFollow = !!currentUserId && currentUserId !== userId;
  const amIFollowing = user.amIFollowing ?? false;

  return (
    <div className="mx-detail">
      <div className="mx-detail-header">
        <a href="/users" className="mx-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          Back
        </a>
      </div>
      <div className="mx-detail-body">
        <div className="mx-detail-author">
          <div className="mx-tweet-avatar">
            <span>M</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className="mx-tweet-handle">{user.email}</span>
              {canFollow && (
                <FollowButton amIFollowing={amIFollowing} isPending={isPending} onToggle={amIFollowing ? unfollow : follow} />
              )}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--mx-muted)", marginTop: "6px", display: "flex", gap: "16px" }}>
              <span><strong>{user.followerCount ?? 0}</strong> followers</span>
              <span><strong>{user.followingCount ?? 0}</strong> following</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mobile bottom nav ─────────────────────────────────────────────────────────

function MobileNav({
  page,
  onCompose,
}: {
  page: string;
  onCompose: () => void;
}) {
  const onFeedPage = page === "feed" || page === "tweet";
  const onUsersPage = page === "users" || page === "user-detail";

  return (
    <nav className="mx-mobile-nav">
      <a
        href="/feed"
        className={`mx-mobile-nav-item${onFeedPage ? " mx-mobile-nav-item--active" : ""}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
        <span>Feed</span>
      </a>

      <button
        className="mx-mobile-nav-compose"
        onClick={onCompose}
        aria-label="New post"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <a
        href="/users"
        className={`mx-mobile-nav-item${onUsersPage ? " mx-mobile-nav-item--active" : ""}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
        <span>Users</span>
      </a>
    </nav>
  );
}

// ── Mobile compose overlay ─────────────────────────────────────────────────────

function MobileComposePage({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  return (
    <div className="mx-compose-overlay">
      <div className="mx-compose-overlay-header">
        <button className="mx-compose-overlay-cancel" onClick={onClose}>
          Cancel
        </button>
        <span className="mx-compose-overlay-title">New Post</span>
        {/* right spacer keeps title centred */}
        <div style={{ minWidth: "60px" }} />
      </div>
      <div className="mx-compose-overlay-body">
        {email ? (
          <ComposeTweet onSuccess={onClose} />
        ) : (
          <div className="mx-signin-cta">
            <p>Sign in to start mixing.</p>
            <a className="mx-btn-post" href="/register">Sign in</a>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const appEl = document.getElementById("app")!;
  const email = appEl.dataset.currentUserEmail ?? "";
  const userId = appEl.dataset.currentUserId ?? "";
  const tweetId = appEl.dataset.tweetId || null;
  const page = appEl.dataset.page ?? "feed";
  const profileUserId = appEl.dataset.userId || null;

  const [mobileCompose, setMobileCompose] = useState(false);
  const isDesktop = useIsDesktop();

  const onFeedPage = page === "feed" || page === "tweet";
  const onUsersPage = page === "users" || page === "user-detail";

  function renderMain() {
    switch (page) {
      case "tweet":
        return (
          <>
            <header className="mx-header">
              <h1 className="mx-header-title">Tweet</h1>
            </header>
            <TweetDetail tweetId={tweetId!} />
          </>
        );
      case "users":
        return (
          <>
            <header className="mx-header">
              <h1 className="mx-header-title">Users</h1>
            </header>
            <UserList />
          </>
        );
      case "user-detail":
        return (
          <>
            <header className="mx-header">
              <h1 className="mx-header-title">Profile</h1>
            </header>
            <UserDetail userId={profileUserId!} />
          </>
        );
      default:
        return (
          <>
            <header className="mx-header">
              <h1 className="mx-header-title">Feed</h1>
              <RefreshButton />
            </header>

            <div className="mx-compose-wrapper">
              {email ? (
                <ComposeTweet />
              ) : (
                <div className="mx-signin-cta">
                  <p>Sign in to start mixing.</p>
                  <a className="mx-btn-post" href="/register">Sign in</a>
                </div>
              )}
            </div>

            <div className="mx-divider" />

            <Feed />
          </>
        );
    }
  }

  return (
    <AuthCtx.Provider value={{ email, userId }}>
      <QueryClientProvider client={queryClient}>
        <div className="mx-root">
          {isDesktop && (
            <aside className="mx-sidebar">
              <div className="mx-logo">
                <span className="mx-logo-icon">⬡</span>
                <span className="mx-logo-text">Mixer</span>
              </div>
              <nav className="mx-nav">
                <a className={`mx-nav-item${onFeedPage ? " mx-nav-active" : ""}`} href="/feed">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                  </svg>
                  Feed
                </a>
                <a className={`mx-nav-item${onUsersPage ? " mx-nav-active" : ""}`} href="/users">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  Users
                </a>
              </nav>
              <div className="mx-sidebar-footer">
                {email ? (
                  <>
                    <span className="mx-version" style={{ color: "var(--mx-fg2)" }}>{email}</span>
                    <a className="mx-auth-link" href="/sign-out">Sign out</a>
                  </>
                ) : (
                  <>
                    <a className="mx-auth-link" href="/register">Create account</a>
                    <a className="mx-auth-link" href="/sign-in">Sign in</a>
                  </>
                )}
                <span className="mx-version">v0.1.0</span>
              </div>
            </aside>
          )}

          <main className="mx-main">
            {renderMain()}
          </main>

          {isDesktop && (
            <div className="mx-rightbar">
              <div className="mx-info-card">
                <h3 className="mx-info-title">About Mixer</h3>
                <p className="mx-info-body">
                  A minimal social feed built with Ash Framework, Phoenix, and React.
                </p>
                <div className="mx-stack">
                  {["Ash 3", "Phoenix 1.8", "AshTypescript", "React 19"].map((s) => (
                    <span key={s} className="mx-tag">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile-only bottom nav — hidden on desktop via CSS */}
        <MobileNav page={page} onCompose={() => setMobileCompose(true)} />

        {/* Mobile compose overlay — only visible on mobile via CSS */}
        {mobileCompose && (
          <MobileComposePage
            email={email}
            onClose={() => setMobileCompose(false)}
          />
        )}
      </QueryClientProvider>
    </AuthCtx.Provider>
  );
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById("app")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
