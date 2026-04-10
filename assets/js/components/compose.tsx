import React, { useState, useRef, useEffect, useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTweet, buildCSRFHeaders } from "../ash_rpc";
import { uploadFile } from "../upload";
import { AuthCtx } from "../context";
import { Avatar, CharCount } from "./ui";

const MAX = 280;

export function ComposeTweet({ onSuccess }: { onSuccess?: () => void }) {
  const { username, displayName, email, avatarUrl } = useContext(AuthCtx);
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
      qc.invalidateQueries({ queryKey: ["following_tweets"] });
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
    e.target.value = "";
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

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  return (
    <div className="mx-compose">
      <Avatar avatarUrl={avatarUrl} name={displayName || username || email} />
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

export function ComposeComment({
  parentTweetId,
  onSuccess,
}: {
  parentTweetId: string;
  onSuccess?: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const { username, displayName, email, avatarUrl } = useContext(AuthCtx);

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await createTweet({
        input: { content, parentTweetId },
        fields: ["id", "content", "userId", "state"],
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed");
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", parentTweetId] });
      qc.invalidateQueries({ queryKey: ["tweet", parentTweetId] });
      qc.invalidateQueries({ queryKey: ["tweets"] });
      qc.invalidateQueries({ queryKey: ["following_tweets"] });
      setText("");
      setError(null);
      onSuccess?.();
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX) { setError(`Max ${MAX} characters`); return; }
    setError(null);
    mutation.mutate(trimmed);
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  return (
    <div className="mx-compose mx-compose--comment">
      <Avatar avatarUrl={avatarUrl} name={displayName || username || email} size="sm" />
      <div className="mx-compose-body">
        <textarea
          ref={textareaRef}
          className="mx-compose-textarea mx-compose-textarea--sm"
          placeholder="Post your reply…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={MAX + 1}
        />
        {error && <p className="mx-compose-error">{error}</p>}
        <div className="mx-compose-footer">
          <div />
          <div className="mx-compose-actions">
            <CharCount current={text.length} max={MAX} />
            <button
              className="mx-btn-post mx-btn-post--sm"
              onClick={submit}
              disabled={!text.trim() || mutation.isPending}
            >
              {mutation.isPending ? "Replying…" : "Reply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
