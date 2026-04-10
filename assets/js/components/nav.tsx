import React from "react";
import { ComposeTweet } from "./compose";

export function MobileNav({
  page,
  onCompose,
}: {
  page: string;
  onCompose: () => void;
}) {
  const onFeedPage = page === "feed" || page === "tweet";
  const onFollowingPage = page === "following";
  const onUsersPage = page === "users" || page === "user-detail";
  const onProfilePage = page === "profile";

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

      <a
        href="/following"
        className={`mx-mobile-nav-item${onFollowingPage ? " mx-mobile-nav-item--active" : ""}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
        <span>Following</span>
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

      <a
        href="/profile"
        className={`mx-mobile-nav-item${onProfilePage ? " mx-mobile-nav-item--active" : ""}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
        <span>Profile</span>
      </a>
    </nav>
  );
}

export function MobileComposePage({
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
