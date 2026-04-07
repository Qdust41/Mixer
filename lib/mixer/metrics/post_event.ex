defmodule Mixer.Metrics.PostEvent do
  @moduledoc """
  Ecto schema that maps to the `post_events` table in ClickHouse.

  Each row represents a single analytics event tied to a tweet (post).
  The table uses a MergeTree engine ordered by `(occurred_at, event_type,
  tweet_id)` for efficient time-range scans and per-tweet aggregations.

  ## Event types

  | event_type         | `tweet_id` refers to  | Description                                     |
  |--------------------|-----------------------|-------------------------------------------------|
  | `"view"`           | the viewed tweet      | Tweet detail page was loaded                    |
  | `"post"`           | the new tweet         | A new top-level tweet was published             |
  | `"comment"`        | the parent tweet      | A reply was posted; count against the parent    |
  | `"like"`           | the liked tweet       | A user liked a tweet                            |
  | `"unlike"`         | the unliked tweet     | A user removed their like                       |
  | `"share"`          | the shared tweet      | A user shared / reposted a tweet                |
  | `"delete_post"`    | the deleted tweet     | A top-level tweet was deleted by its author     |
  | `"delete_comment"` | the parent tweet      | A reply was deleted; count against the parent   |
  """

  use Ecto.Schema

  @primary_key false

  schema "post_events" do
    # Must be Ch-typed so ecto_ch emits LowCardinality(String) in the RowBinary
    # header, matching the ClickHouse table DDL exactly.
    field :event_type, Ch, type: "LowCardinality(String)"

    # The tweet that the event relates to
    field :tweet_id, Ecto.UUID

    # The acting user; may be nil for anonymous views.
    # Must be Ch-typed so ecto_ch emits Nullable(UUID) in the RowBinary header,
    # matching the ClickHouse table DDL exactly.
    field :user_id, Ch, type: "Nullable(UUID)"

    # Wall-clock time of the event (UTC, second precision)
    field :occurred_at, :utc_datetime

    # Optional originating IP, useful for deduplicating anonymous views.
    # Nullable(String) for the same reason as user_id above.
    field :ip_address, Ch, type: "Nullable(String)"
  end
end
