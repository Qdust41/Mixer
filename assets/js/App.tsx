import React, { useState } from "react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { AuthCtx } from "./context";
import { useIsDesktop } from "./hooks";
import { ComposeTweet } from "./components/compose";
import { Feed, FollowingFeed, RefreshButton } from "./components/feed";
import { TweetDetail } from "./components/tweet-detail";
import { UserList, UserDetail } from "./components/users";
import { MyProfile } from "./components/profile";
import { MobileNav, MobileComposePage } from "./components/nav";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000 } },
});

export function App() {
  const appEl = document.getElementById("app")!;
  const email = appEl.dataset.currentUserEmail ?? "";
  const userId = appEl.dataset.currentUserId ?? "";
  const username = appEl.dataset.currentUserUsername ?? "";
  const displayName = appEl.dataset.currentUserDisplayName ?? "";
  const avatarUrl = appEl.dataset.currentUserAvatarUrl ?? "";
  const tweetId = appEl.dataset.tweetId || null;
  const page = appEl.dataset.page ?? "feed";
  const profileUserId = appEl.dataset.userId || null;

  const [mobileCompose, setMobileCompose] = useState(false);
  const isDesktop = useIsDesktop();

  const onFeedPage = page === "feed" || page === "tweet";
  const onFollowingPage = page === "following";
  const onUsersPage = page === "users" || page === "user-detail";
  const onProfilePage = page === "profile";

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
      case "following":
        return (
          <>
            <header className="mx-header">
              <h1 className="mx-header-title">Following</h1>
              <RefreshButton queryKey={["following_tweets"]} />
            </header>
            <FollowingFeed />
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
      case "profile":
        return (
          <>
            <header className="mx-header">
              <h1 className="mx-header-title">My Profile</h1>
            </header>
            <MyProfile />
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
    <AuthCtx.Provider value={{ email, userId, username, displayName, avatarUrl }}>
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
                <a className={`mx-nav-item${onFollowingPage ? " mx-nav-active" : ""}`} href="/following">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  Following
                </a>
                <a className={`mx-nav-item${onUsersPage ? " mx-nav-active" : ""}`} href="/users">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  Users
                </a>
                <a className={`mx-nav-item${onProfilePage ? " mx-nav-active" : ""}`} href="/profile">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  Profile
                </a>
              </nav>
              <div className="mx-sidebar-footer">
                {email ? (
                  <>
                    <span className="mx-version" style={{ color: "var(--mx-fg2)" }}>
                      {displayName || username || email}
                    </span>
                    {username && (
                      <span className="mx-version">@{username}</span>
                    )}
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

        <MobileNav page={page} onCompose={() => setMobileCompose(true)} />

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
