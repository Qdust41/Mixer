import React, { useRef, useEffect, useContext, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { readTweet, readFollowingFeed, buildCSRFHeaders } from "../ash_rpc";
import { AuthCtx } from "../context";
import { FEED_PAGE_SIZE } from "../constants";
import { Spinner, ErrorBanner } from "./ui";
import { TweetCard } from "./tweet-card";
import type { Tweet } from "../types";

export function Feed() {
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
        fields: ["id", "content", "likes", "likedByMe", "commentCount", "userId", "state", "userEmail", "userUsername", "userDisplayName", "userAvatarUrl", "insertedAt", { media: ["id", "s3Key"] }],
        sort: "-insertedAt",
        page: { limit: FEED_PAGE_SIZE, offset: pageParam },
        filter: { parentTweetId: { isNil: true } },
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
  if (isError) return <ErrorBanner message={(error as Error)?.message ?? "Could not load tweets"} />;

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
      <div ref={sentinelRef} style={{ height: "1px" }} />
      {isFetchingNextPage && <Spinner />}
    </div>
  );
}

export function FollowingFeed() {
  const { userId } = useContext(AuthCtx);
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
    queryKey: ["following_tweets"],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await readFollowingFeed({
        fields: ["id", "content", "likes", "likedByMe", "commentCount", "userId", "state", "userEmail", "userUsername", "userDisplayName", "userAvatarUrl", "insertedAt", { media: ["id", "s3Key"] }],
        sort: "-insertedAt",
        page: { limit: FEED_PAGE_SIZE, offset: pageParam },
        filter: { parentTweetId: { isNil: true } },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error("Failed to load following feed");
      const pageData = res.data as any;
      const tweets: Tweet[] = Array.isArray(pageData) ? pageData : (pageData?.results ?? []);
      const hasMore: boolean = Array.isArray(pageData) ? false : (pageData?.hasMore ?? false);
      return { tweets, hasMore, nextOffset: pageParam + FEED_PAGE_SIZE };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
    enabled: !!userId,
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

  if (!userId) {
    return (
      <div className="mx-empty">
        <div className="mx-empty-icon">★</div>
        <p className="mx-empty-title">Your personalised feed</p>
        <p className="mx-empty-sub">
          <a href="/sign-in" style={{ color: "var(--mx-accent)", textDecoration: "none" }}>Sign in</a>
          {" "}to see posts from people you follow.
        </p>
      </div>
    );
  }

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorBanner message={(error as Error)?.message ?? "Could not load following feed"} />;

  const tweets = data?.pages.flatMap((p) => p.tweets) ?? [];

  if (tweets.length === 0) {
    return (
      <div className="mx-empty">
        <div className="mx-empty-icon">★</div>
        <p className="mx-empty-title">Nothing here yet</p>
        <p className="mx-empty-sub">
          Follow some people from the{" "}
          <a href="/users" style={{ color: "var(--mx-accent)", textDecoration: "none" }}>Users</a>
          {" "}page to fill this feed.
        </p>
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

export function RefreshButton({ queryKey = ["tweets"] }: { queryKey?: string[] }) {
  const qc = useQueryClient();
  const [spinning, setSpinning] = useState(false);

  async function refresh() {
    setSpinning(true);
    await qc.invalidateQueries({ queryKey });
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
