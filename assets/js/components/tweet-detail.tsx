import React, { useState, useRef, useEffect, useContext } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readTweet, destroyTweet, updateTweet, likeTweet, unlikeTweet, buildCSRFHeaders } from "../ash_rpc";
import { AuthCtx } from "../context";
import { getAssetHost, userDisplayLabel } from "../utils";
import { COMMENTS_PAGE_SIZE } from "../constants";
import { Spinner, ErrorBanner, Avatar } from "./ui";
import { MediaLightbox } from "./media";
import { CommentIcon, CommentCard } from "./tweet-card";
import { ComposeComment } from "./compose";
import type { Tweet, MediaItem } from "../types";

export function TweetDetail({ tweetId }: { tweetId: string }) {
  const { userId: currentUserId, email } = useContext(AuthCtx);
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
        fields: ["id", "content", "likes", "likedByMe", "commentCount", "userId", "state", "userEmail", "userUsername", "userDisplayName", "userAvatarUrl", "insertedAt", { media: ["id", "s3Key"] }],
        filter: { id: { eq: tweetId } },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error("Failed to load tweet");
      const results = Array.isArray(res.data) ? res.data : (res.data as any)?.results ?? [];
      return (results[0] as Tweet) ?? null;
    },
  });

  const commentsSentinelRef = useRef<HTMLDivElement>(null);

  const {
    data: commentsData,
    isLoading: commentsLoading,
    fetchNextPage: fetchNextComments,
    hasNextPage: hasMoreComments,
    isFetchingNextPage: isFetchingMoreComments,
  } = useInfiniteQuery({
    queryKey: ["comments", tweetId],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await readTweet({
        fields: ["id", "content", "likes", "likedByMe", "parentTweetId", "userId", "state", "userEmail", "userUsername", "userDisplayName", "userAvatarUrl", "insertedAt", { media: ["id", "s3Key"] }],
        filter: { parentTweetId: { eq: tweetId } },
        sort: "insertedAt",
        page: { limit: COMMENTS_PAGE_SIZE, offset: pageParam },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error("Failed to load comments");
      const pageData = res.data as any;
      const comments: Tweet[] = Array.isArray(pageData) ? pageData : (pageData?.results ?? []);
      const hasMore: boolean = Array.isArray(pageData) ? false : (pageData?.hasMore ?? false);
      return { comments, hasMore, nextOffset: pageParam + COMMENTS_PAGE_SIZE };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
  });

  useEffect(() => {
    const el = commentsSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreComments && !isFetchingMoreComments) {
          fetchNextComments();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreComments, isFetchingMoreComments, fetchNextComments]);

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
          <Avatar avatarUrl={tweet.userAvatarUrl} name={tweet.userDisplayName || tweet.userUsername || tweet.userEmail} />
          <div>
            <span className="mx-tweet-handle">{userDisplayLabel({ displayName: tweet.userDisplayName, username: tweet.userUsername, email: tweet.userEmail })}</span>
            {tweet.userUsername && (
              <div style={{ fontSize: "0.8rem", color: "var(--mx-muted)" }}>@{tweet.userUsername}</div>
            )}
          </div>
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
          <span className="mx-like-btn mx-comment-count-badge" style={{ cursor: "default" }}>
            <CommentIcon />
            <span>{tweet.commentCount ?? 0} {(tweet.commentCount ?? 0) === 1 ? "reply" : "replies"}</span>
          </span>
        </div>

        {error && !editing && <p className="mx-compose-error">{error}</p>}
      </div>

      {lightboxItem && <MediaLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />}

      <div className="mx-comments-section">
        <div className="mx-comments-divider">
          <span>Replies</span>
        </div>

        {email ? (
          <ComposeComment parentTweetId={tweetId} />
        ) : (
          <div className="mx-signin-cta mx-signin-cta--sm">
            <p><a href="/sign-in" style={{ color: "var(--mx-accent)", textDecoration: "none" }}>Sign in</a> to reply.</p>
          </div>
        )}

        {commentsLoading ? (
          <Spinner />
        ) : (() => {
          const comments = commentsData?.pages.flatMap((p) => p.comments) ?? [];
          return comments.length > 0 ? (
            <div className="mx-comments-list">
              {comments.map((c) => (
                <CommentCard key={c.id} comment={c} parentTweetOwnerId={tweet?.userId} />
              ))}
              <div ref={commentsSentinelRef} style={{ height: "1px" }} />
              {isFetchingMoreComments && <Spinner />}
            </div>
          ) : (
            <div className="mx-empty mx-empty--sm">
              <p className="mx-empty-sub">No replies yet. Be the first!</p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
