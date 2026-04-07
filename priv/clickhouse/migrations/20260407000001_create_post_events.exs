defmodule Mixer.ClickhouseRepo.Migrations.CreatePostEvents do
  use Ecto.Migration

  @doc """
  Creates the `post_events` table using a MergeTree engine.

  Key design decisions:

  * `LowCardinality(String)` for `event_type` — the cardinality is tiny
    (5–10 values), so ClickHouse can store it as a dictionary, giving both
    compression and faster filtering.

  * `Nullable(UUID)` / `Nullable(String)` for optional columns — ClickHouse
    handles NULLs differently from PostgreSQL; we make the nullable fields
    explicit so the schema is unambiguous.

  * `ORDER BY (occurred_at, event_type, tweet_id)` — optimises the two most
    common query patterns:
      1. Time-range scans (`WHERE occurred_at >= now() - interval 24 HOUR`)
      2. Per-tweet aggregations (`WHERE tweet_id = ?`)

  * `PARTITION BY toYYYYMM(occurred_at)` — monthly partitions make it cheap
    to drop old data with `ALTER TABLE … DROP PARTITION`.

  * `TTL occurred_at + INTERVAL 1 YEAR DELETE` — automatically reclaim disk
    space after two years. Adjust as required.
  """
  def up do
    execute("""
    CREATE TABLE IF NOT EXISTS post_events
    (
        event_type  LowCardinality(String),
        tweet_id    UUID,
        user_id     Nullable(UUID),
        occurred_at DateTime,
        ip_address  Nullable(String)
    )
    ENGINE = MergeTree()
    PARTITION BY toYYYYMM(occurred_at)
    ORDER BY (occurred_at, event_type, tweet_id)
    TTL occurred_at + INTERVAL 1 YEAR DELETE
    SETTINGS index_granularity = 8192
    """)
  end

  def down do
    execute("DROP TABLE IF EXISTS post_events")
  end
end
