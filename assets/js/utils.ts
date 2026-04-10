export function timeAgo(insertedAt?: string | null): string {
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

export function getAssetHost(): string {
  const appEl = document.getElementById("app");
  return appEl?.dataset.assetHost ?? "http://localhost:9000";
}

export function userDisplayLabel(u: {
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  return u.displayName || u.username || u.email || "@mixer";
}

export function userHandle(u: { username?: string | null; email?: string | null }): string {
  return u.username ? `@${u.username}` : u.email ?? "@mixer";
}
