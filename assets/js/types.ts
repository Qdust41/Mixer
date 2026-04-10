export type User = {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  followerCount?: number;
  followingCount?: number;
  amIFollowing?: boolean;
  myFollowId?: string | null;
};

export type MediaItem = { id: string; s3Key: string };

export type Tweet = {
  id: string;
  content: string;
  likes: number;
  likedByMe?: boolean;
  commentCount?: number;
  parentTweetId?: string | null;
  userId: string;
  state: string;
  media?: MediaItem[];
  userEmail?: string | null;
  userUsername?: string | null;
  userDisplayName?: string | null;
  userAvatarUrl?: string | null;
  insertedAt?: string | null;
};

export type ContextMenuItem =
  | { type: "item"; label: string; onClick: () => void }
  | { type: "separator" };
