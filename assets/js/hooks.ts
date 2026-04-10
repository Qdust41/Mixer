import { useSyncExternalStore } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { followUser, unfollowUser, buildCSRFHeaders } from "./ash_rpc";

// ── useIsDesktop ──────────────────────────────────────────────────────────────
// Returns true when viewport is wider than 960px. Reacts to resize.

const DESKTOP_MQ =
  typeof window !== "undefined" ? window.matchMedia("(min-width: 961px)") : null;

function subscribe(cb: () => void) {
  DESKTOP_MQ?.addEventListener("change", cb);
  return () => DESKTOP_MQ?.removeEventListener("change", cb);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => DESKTOP_MQ?.matches ?? true,
    () => true,
  );
}

// ── useFollowUser ─────────────────────────────────────────────────────────────

export function useFollowUser(targetUserId: string) {
  const qc = useQueryClient();

  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await followUser({
        input: { followingId: targetUserId },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error((res.errors?.[0] as any)?.message ?? "Follow failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user", targetUserId] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const res = await unfollowUser({
        input: { followingId: targetUserId },
        headers: buildCSRFHeaders(),
      });
      if (!res.success) throw new Error((res.errors?.[0] as any)?.message ?? "Unfollow failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user", targetUserId] });
    },
  });

  return {
    follow: () => followMutation.mutate(),
    unfollow: () => unfollowMutation.mutate(),
    isPending: followMutation.isPending || unfollowMutation.isPending,
  };
}
