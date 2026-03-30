import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createTweet,
  readTweet,
  destroyTweet,
  updateTweet,
  buildCSRFHeaders,
} from "./ash_rpc";
import { uploadFile } from "./upload";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000 } },
});

// ── Types ──────────────────────────────────────────────────────────────────────

type MediaItem = { id: string; s3Key: string };
type Tweet = { id: string; content: string; userId: string; state: string; media?: MediaItem[] };

// ── Auth context ───────────────────────────────────────────────────────────────

const AuthCtx = createContext({ email: "", userId: "" });

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(): string {
  return "just now";
}

function getAssetHost(): string {
  const appEl = document.getElementById("app");
  return appEl?.dataset.assetHost ?? "http://localhost:3901";
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
      onSuccess?.();
    },
    onError: (e: Error) => setError(e.message),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so the same file can be re-selected after removal
    e.target.value = "";
    setPendingFile(file);
    setMediaId(null);
    setUploadError(null);
    setUploading(true);
    const csrfToken = buildCSRFHeaders()["X-CSRF-Token"] as string;
    const result = await uploadFile(file, csrfToken);
    setUploading(false);
    if ("error" in result) {
      setUploadError(result.error);
      setPendingFile(null);
    } else {
      setMediaId(result.mediaId);
    }
  }

  function removeAttachment() {
    setPendingFile(null);
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
              <span style={{ fontSize: "0.75rem", color: "var(--mx-muted)" }}>Uploading…</span>
            )}
            {pendingFile && !uploading && (
              <span style={{ fontSize: "0.75rem", color: "var(--mx-muted)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {pendingFile.name}
                <button
                  type="button"
                  onClick={removeAttachment}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "inherit" }}
                  title="Remove attachment"
                >
                  ×
                </button>
              </span>
            )}
            {uploadError && (
              <span style={{ fontSize: "0.75rem", color: "#ef4444" }}>{uploadError}</span>
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

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(tweet.content);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();

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

  function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed) return;
    updateMutation.mutate(trimmed);
  }

  return (
    <article className="mx-tweet">
      <div className="mx-tweet-avatar">
        <span>M</span>
      </div>
      <div className="mx-tweet-body">
        <div className="mx-tweet-header">
          <span className="mx-tweet-handle">@mixer</span>
          <span className="mx-tweet-dot">·</span>
          <span className="mx-tweet-time">{timeAgo()}</span>
          {canModify && (
            <div className="mx-tweet-actions">
              <button
                className="mx-action-btn"
                title="Edit"
                onClick={() => {
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

        {error && !editing && <p className="mx-compose-error">{error}</p>}
      </div>
    </article>
  );
}

function Feed() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tweets"],
    queryFn: async () => {
      const res = await readTweet({
        fields: ["id", "content", "userId", "state", { media: ["id", "s3Key"] }],
        sort: "-id",
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error("Failed to load tweets");
      const tweets = Array.isArray(res.data) ? res.data : (res.data as any)?.results ?? [];
      return tweets as Tweet[];
    },
  });

  if (isLoading) return <Spinner />;
  if (isError) {
    return (
      <ErrorBanner message={(error as Error)?.message ?? "Could not load tweets"} />
    );
  }

  const tweets = data ?? [];

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

function App() {
  const appEl = document.getElementById("app")!;
  const email = appEl.dataset.currentUserEmail ?? "";
  const userId = appEl.dataset.currentUserId ?? "";

  return (
    <AuthCtx.Provider value={{ email, userId }}>
      <QueryClientProvider client={queryClient}>
        <div className="mx-root">
          <aside className="mx-sidebar">
            <div className="mx-logo">
              <span className="mx-logo-icon">⬡</span>
              <span className="mx-logo-text">Mixer</span>
            </div>
            <nav className="mx-nav">
              <a className="mx-nav-item mx-nav-active" href="#">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
                Feed
              </a>
            </nav>
            <div className="mx-sidebar-footer">
              {email ? (
                <>
                  <span className="mx-version" style={{ color: "var(--mx-fg2)" }}>{email}</span>
                  <a className="mx-auth-link" href="/auth/sign-out">Sign out</a>
                </>
              ) : (
                <>
                  <a className="mx-auth-link" href="/register">Create account</a>
                  <a className="mx-auth-link" href="/auth/sign-in">Sign in</a>
                </>
              )}
              <span className="mx-version">v0.1.0</span>
            </div>
          </aside>

          <main className="mx-main">
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
          </main>

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
        </div>
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
