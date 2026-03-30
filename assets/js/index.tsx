import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  readTweet,
  createTweet,
  destroyTweet,
  buildCSRFHeaders,
} from "./ash_rpc";

type Tweet = {
  id: string;
  content: string;
  userId: string;
  state: "posted" | "drafted";
};

function TweetCompose({ onPosted }: { onPosted: (tweet: Tweet) => void }) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    const result = await createTweet({
      input: { content: content.trim() },
      fields: ["id", "content", "userId", "state"],
      headers: buildCSRFHeaders(),
    });
    setSubmitting(false);
    if (result.success) {
      onPosted(result.data as Tweet);
      setContent("");
    } else {
      setError(result.errors.map((e) => e.message).join(", "));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card bg-base-200 p-4 mb-6">
      <textarea
        className="textarea textarea-bordered w-full mb-3 resize-none"
        rows={3}
        placeholder="What's happening?"
        value={content}
        maxLength={280}
        onChange={(e) => setContent(e.target.value)}
      />
      {error && <p className="text-error text-sm mb-2">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-sm opacity-50">{content.length}/280</span>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={submitting || !content.trim()}
        >
          {submitting ? "Posting..." : "Post"}
        </button>
      </div>
    </form>
  );
}

function TweetCard({
  tweet,
  currentUserEmail,
  onDeleted,
}: {
  tweet: Tweet;
  currentUserEmail: string;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await destroyTweet({
      identity: tweet.id,
      headers: buildCSRFHeaders(),
    });
    if (result.success) {
      onDeleted(tweet.id);
    } else {
      setDeleting(false);
    }
  }

  return (
    <div className="card bg-base-200 mb-3 p-4">
      <p className="text-base-content whitespace-pre-wrap break-words">
        {tweet.content}
      </p>
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs opacity-40 font-mono">
          {tweet.userId.slice(0, 8)}…
        </span>
        {currentUserEmail && (
          <button
            className="btn btn-ghost btn-xs text-error"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}

function TweetFeed({
  tweets,
  currentUserEmail,
  onDeleted,
}: {
  tweets: Tweet[];
  currentUserEmail: string;
  onDeleted: (id: string) => void;
}) {
  if (tweets.length === 0) {
    return (
      <p className="text-center opacity-40 py-12">
        No tweets yet. Be the first!
      </p>
    );
  }
  return (
    <>
      {tweets.map((tweet) => (
        <TweetCard
          key={tweet.id}
          tweet={tweet}
          currentUserEmail={currentUserEmail}
          onDeleted={onDeleted}
        />
      ))}
    </>
  );
}

function App() {
  const appEl = document.getElementById("app")!;
  const currentUserEmail = appEl.dataset.currentUserEmail ?? "";

  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readTweet({ fields: ["id", "content", "userId", "state"] }).then(
      (result) => {
        if (result.success) {
          const data = result.data;
          const list: Tweet[] = Array.isArray(data)
            ? (data as Tweet[]).slice().reverse()
            : (data as any).results
              ? ((data as any).results as Tweet[]).slice().reverse()
              : [];
          setTweets(list);
        }
        setLoading(false);
      }
    );
  }, []);

  function handlePosted(tweet: Tweet) {
    setTweets((prev) => [tweet, ...prev]);
  }

  function handleDeleted(id: string) {
    setTweets((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Mixer Feed</h1>
          {currentUserEmail ? (
            <div className="flex items-center gap-3">
              <span className="text-sm opacity-60">{currentUserEmail}</span>
              <a href="/auth/sign-out" className="btn btn-ghost btn-sm">
                Sign out
              </a>
            </div>
          ) : (
            <a href="/register" className="btn btn-primary btn-sm">
              Sign in
            </a>
          )}
        </div>

        {currentUserEmail && <TweetCompose onPosted={handlePosted} />}

        {loading ? (
          <p className="text-center opacity-40 py-12">Loading…</p>
        ) : (
          <TweetFeed
            tweets={tweets}
            currentUserEmail={currentUserEmail}
            onDeleted={handleDeleted}
          />
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
