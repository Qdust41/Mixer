import React, { useState, useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { destroyTweet, updateTweet, likeTweet, unlikeTweet, buildCSRFHeaders } from "../ash_rpc";
import { AuthCtx } from "../context";
import { timeAgo, userDisplayLabel } from "../utils";
import { Avatar, ContextMenu } from "./ui";
import { TweetMedia } from "./media";
import type { Tweet, ContextMenuItem } from "../types";

export function CommentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
    </svg>
  );
}

export function TweetCard({ tweet }: { tweet: Tweet }) {
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
      const res = await destroyTweet({ identity: tweet.id, headers: buildCSRFHeaders() });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tweets"] });
      qc.invalidateQueries({ queryKey: ["following_tweets"] });
    },
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
      qc.invalidateQueries({ queryKey: ["following_tweets"] });
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
      qc.invalidateQueries({ queryKey: ["following_tweets"] });
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
      <Avatar avatarUrl={tweet.userAvatarUrl} name={tweet.userDisplayName || tweet.userUsername || tweet.userEmail} />
      <div className="mx-tweet-body">
        <div className="mx-tweet-header">
          <span className="mx-tweet-handle">{userDisplayLabel({ displayName: tweet.userDisplayName, username: tweet.userUsername, email: tweet.userEmail })}</span>
          {tweet.userUsername && (
            <span className="mx-tweet-subhandle">@{tweet.userUsername}</span>
          )}
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
                onClick={() => { setEditing(false); setError(null); }}
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
          <a
            href={`/feed/${tweet.id}`}
            className="mx-like-btn mx-comment-btn"
            onClick={(e) => e.stopPropagation()}
            title="View comments"
          >
            <CommentIcon />
            <span>{tweet.commentCount ?? 0}</span>
          </a>
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

export function CommentCard({
  comment,
  parentTweetOwnerId,
}: {
  comment: Tweet;
  parentTweetOwnerId?: string;
}) {
  const { userId: currentUserId } = useContext(AuthCtx);
  const canLike = !!currentUserId;
  const canModify =
    !!currentUserId &&
    (comment.userId === currentUserId || parentTweetOwnerId === currentUserId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await destroyTweet({ identity: comment.id, headers: buildCSRFHeaders() });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", comment.parentTweetId] });
      qc.invalidateQueries({ queryKey: ["tweet", comment.parentTweetId] });
      qc.invalidateQueries({ queryKey: ["tweets"] });
      qc.invalidateQueries({ queryKey: ["following_tweets"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      const action = comment.likedByMe ? unlikeTweet : likeTweet;
      const res = await action({
        identity: comment.id,
        fields: ["id", "likes", "likedByMe"],
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error(res.errors?.[0]?.message ?? "Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", comment.parentTweetId] }),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <article className="mx-tweet mx-comment">
      <Avatar
        avatarUrl={comment.userAvatarUrl}
        name={comment.userDisplayName || comment.userUsername || comment.userEmail}
        size="sm"
      />
      <div className="mx-tweet-body">
        <div className="mx-tweet-header">
          <span className="mx-tweet-handle">{userDisplayLabel({ displayName: comment.userDisplayName, username: comment.userUsername, email: comment.userEmail })}</span>
          {comment.userUsername && (
            <span className="mx-tweet-subhandle">@{comment.userUsername}</span>
          )}
          <span className="mx-tweet-dot">·</span>
          <span className="mx-tweet-time" title={comment.insertedAt ? new Date(comment.insertedAt).toLocaleString() : undefined}>{timeAgo(comment.insertedAt)}</span>
          {canModify && (
            <div className="mx-tweet-actions">
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
        <p className="mx-tweet-text">{comment.content}</p>
        {comment.media && comment.media.length > 0 && <TweetMedia media={comment.media} />}
        <div className="mx-tweet-footer">
          <button
            className={`mx-like-btn${comment.likedByMe ? " mx-like-btn-active" : ""}`}
            onClick={() => likeMutation.mutate()}
            disabled={!canLike || likeMutation.isPending}
            title={canLike ? (comment.likedByMe ? "Remove like" : "Like reply") : "Sign in to like replies"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.1 21.35 10.55 19.93C5.4 15.27 2 12.19 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.69-3.4 6.77-8.55 11.44z" />
            </svg>
            <span>{comment.likes}</span>
          </button>
        </div>
        {error && <p className="mx-compose-error">{error}</p>}
      </div>
    </article>
  );
}
