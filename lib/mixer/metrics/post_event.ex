defmodule Mixer.Metrics.PostEvent do
  @moduledoc """
  Ecto schema that maps to the `post_events` table in ClickHouse.

  Each row represents a single analytics event tied to a tweet (post).
  The table uses a MergeTree engine ordered by `(occurred_at, event_type,
  tweet_id)` for efficient time-range scans and per-tweet aggregations.

  ## Event types

  | event_type  | Description                              |
  |-------------|------------------------------------------|
  | `"view"`    | A tweet was displayed to a user          |
  | `"like"`    | A user liked a tweet                     |
  | `"unlike"`  | A user removed their like from a tweet   |
  | `"comment"` | A user replied to a tweet                |
  | `"share"`   | A user shared / reposted a tweet         |
  """

  use Ecto.Schema

  @primary_key false

  schema "post_events" do
    # LowCardinality(String) in ClickHouse — keep values in the set above
    field :event_type, :string

    # The tweet that the event relates to
    field :tweet_id, Ecto.UUID

    # The acting user; may be nil for anonymous views
    field :user_id, Ecto.UUID

    # Wall-clock time of the event (UTC, second precision)
    field :occurred_at, :utc_datetime

    # Optional originating IP, useful for deduplicating anonymous views
    field :ip_address, :string
  end
end
