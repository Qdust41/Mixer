import React, { useState, useRef, useEffect, useContext } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { readUser, readTweet, buildCSRFHeaders } from "../ash_rpc";
import { AuthCtx } from "../context";
import { FEED_PAGE_SIZE } from "../constants";
import { userDisplayLabel } from "../utils";
import { useFollowUser } from "../hooks";
import { Spinner, ErrorBanner, Avatar, ContextMenu } from "./ui";
import { TweetCard } from "./tweet-card";
import type { User, Tweet, ContextMenuItem } from "../types";

export function FollowButton({
  amIFollowing,
  isPending,
  onToggle,
}: {
  amIFollowing: boolean;
  isPending: boolean;
  onToggle: () => void;
}) {
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

export function UserCard({ user }: { user: User }) {
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
      <Avatar avatarUrl={user.avatarUrl} name={user.displayName || user.username || user.email} />
      <div className="mx-tweet-body">
        <div className="mx-tweet-header">
          <span className="mx-tweet-handle">{userDisplayLabel(user)}</span>
          {user.username && (
            <span className="mx-tweet-subhandle">@{user.username}</span>
          )}
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

export function UserList() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await readUser({
        fields: ["id", "email", "username", "displayName", "avatarUrl", "followerCount", "followingCount", "amIFollowing"],
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

export function UserFeed({ userId }: { userId: string }) {
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
    queryKey: ["user-tweets", userId],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await readTweet({
        fields: ["id", "content", "likes", "likedByMe", "commentCount", "userId", "state", "userEmail", "userUsername", "userDisplayName", "userAvatarUrl", "insertedAt", { media: ["id", "s3Key"] }],
        sort: "-insertedAt",
        page: { limit: FEED_PAGE_SIZE, offset: pageParam },
        filter: { userId: { eq: userId }, parentTweetId: { isNil: true } },
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
  if (isError) return <ErrorBanner message={(error as Error)?.message ?? "Could not load posts"} />;

  const tweets = data?.pages.flatMap((p) => p.tweets) ?? [];

  if (tweets.length === 0) {
    return (
      <div className="mx-empty">
        <div className="mx-empty-icon">◎</div>
        <p className="mx-empty-title">No posts yet</p>
      </div>
    );
  }

  return (
    <div className="mx-feed">
      {tweets.map((t) => (
        <TweetCard key={t.id} tweet={t} />
      ))}
      <div ref={sentinelRef} style={{ height: "1px" }} />
      {isFetchingNextPage && <Spinner />}
    </div>
  );
}

export function UserDetail({ userId, isStandalone = false }: { userId: string; isStandalone?: boolean }) {
  const { userId: currentUserId } = useContext(AuthCtx);
  const { follow, unfollow, isPending } = useFollowUser(userId);
  const { data: user, isLoading, isError } = useQuery({
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

  if (isLoading) return <Spinner />;
  if (isError || !user) return <ErrorBanner message="Could not load user" />;

  const isOwnProfile = currentUserId === userId;
  const canFollow = !!currentUserId && !isOwnProfile;
  const amIFollowing = user.amIFollowing ?? false;

  return (
    <div className="mx-detail">
      {!isStandalone && (
        <div className="mx-detail-header">
          <a href="/users" className="mx-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            Back
          </a>
        </div>
      )}
      <div className="mx-detail-body">
        <div className="mx-detail-author">
          <Avatar avatarUrl={user.avatarUrl} name={user.displayName || user.username || user.email} size="lg" />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div className="mx-tweet-handle" style={{ fontSize: "1.1rem" }}>{userDisplayLabel(user)}</div>
                {user.username && (
                  <div style={{ fontSize: "0.85rem", color: "var(--mx-muted)" }}>@{user.username}</div>
                )}
              </div>
              {canFollow && (
                <FollowButton amIFollowing={amIFollowing} isPending={isPending} onToggle={amIFollowing ? unfollow : follow} />
              )}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--mx-muted)", marginTop: "8px", display: "flex", gap: "16px" }}>
              <span><strong style={{ color: "var(--mx-fg)" }}>{user.followerCount ?? 0}</strong> followers</span>
              <span><strong style={{ color: "var(--mx-fg)" }}>{user.followingCount ?? 0}</strong> following</span>
            </div>
          </div>
        </div>
      </div>
      <UserFeed userId={userId} />
    </div>
  );
}
