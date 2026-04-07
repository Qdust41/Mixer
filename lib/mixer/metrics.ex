defmodule Mixer.Metrics do
  @moduledoc """
  Public API for tracking and querying post (tweet) metrics via ClickHouse.

  ## Tracking events

  Tracking calls are non-blocking — events are handed off to the in-memory
  `Mixer.Metrics.Buffer` GenServer and written to ClickHouse in batches.

      # Record a tweet view (anonymous)
      Mixer.Metrics.track_view(tweet_id)

      # Record a view with a logged-in user and their IP
      Mixer.Metrics.track_view(tweet_id, user_id: user.id, ip_address: conn.remote_ip)

  ## Querying metrics

  Query functions execute synchronous ClickHouse SQL and return plain maps.

      {:ok, summary} = Mixer.Metrics.get_summary(tweet_id)
      # => %{views: 42, likes: 7, unlikes: 1, comments: 3, shares: 0}

      {:ok, rows} = Mixer.Metrics.get_top_posts(10)
      # => [%{tweet_id: "...", views: 99}, ...]
  """

  require Logger

  alias Mixer.ClickhouseRepo
  alias Mixer.Metrics.Buffer

  # ---------------------------------------------------------------------------
  # Event types
  # ---------------------------------------------------------------------------

  @type event_type :: :view | :like | :unlike | :comment | :share

  @type track_opt ::
          {:user_id, binary() | nil}
          | {:ip_address, binary() | :inet.ip_address() | nil}

  # ---------------------------------------------------------------------------
  # Tracking helpers
  # ---------------------------------------------------------------------------

  @doc """
  Track a tweet view event.

  ## Options

    * `:user_id` — UUID of the viewing user (nil for anonymous)
    * `:ip_address` — originating IP; accepts a string or an `:inet` tuple
  """
  @spec track_view(binary(), [track_opt()]) :: :ok
  def track_view(tweet_id, opts \\ []), do: enqueue("view", tweet_id, opts)

  @doc "Track a tweet like event."
  @spec track_like(binary(), [track_opt()]) :: :ok
  def track_like(tweet_id, opts \\ []), do: enqueue("like", tweet_id, opts)

  @doc "Track a tweet unlike event."
  @spec track_unlike(binary(), [track_opt()]) :: :ok
  def track_unlike(tweet_id, opts \\ []), do: enqueue("unlike", tweet_id, opts)

  @doc "Track a comment (reply) event on a tweet."
  @spec track_comment(binary(), [track_opt()]) :: :ok
  def track_comment(tweet_id, opts \\ []), do: enqueue("comment", tweet_id, opts)

  @doc "Track a tweet share / repost event."
  @spec track_share(binary(), [track_opt()]) :: :ok
  def track_share(tweet_id, opts \\ []), do: enqueue("share", tweet_id, opts)

  # ---------------------------------------------------------------------------
  # Query helpers
  # ---------------------------------------------------------------------------

  @doc """
  Return a summary of all event counts for a single tweet.

  Returns `{:ok, map}` on success or `{:error, reason}` on failure.

  ## Example

      {:ok, %{views: 12, likes: 3, unlikes: 0, comments: 5, shares: 1}} =
        Mixer.Metrics.get_summary(tweet_id)
  """
  @spec get_summary(binary()) :: {:ok, map()} | {:error, term()}
  def get_summary(tweet_id) do
    sql = """
    SELECT
      countIf(event_type = 'view')    AS views,
      countIf(event_type = 'like')    AS likes,
      countIf(event_type = 'unlike')  AS unlikes,
      countIf(event_type = 'comment') AS comments,
      countIf(event_type = 'share')   AS shares
    FROM post_events
    WHERE tweet_id = {tweet_id:String}
    """

    case ClickhouseRepo.query(sql, %{"tweet_id" => tweet_id}) do
      {:ok, result} ->
        {:ok, row_to_summary(result)}

      {:error, reason} ->
        Logger.error("[Mixer.Metrics] get_summary failed for #{tweet_id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Return view counts bucketed by UTC hour for the past `hours` hours.

  Useful for rendering a sparkline on a tweet detail page.

  ## Example

      {:ok, rows} = Mixer.Metrics.get_hourly_views(tweet_id, 24)
      # => [%{hour: ~N[2026-04-07 00:00:00], views: 5}, ...]
  """
  @spec get_hourly_views(binary(), pos_integer()) :: {:ok, [map()]} | {:error, term()}
  def get_hourly_views(tweet_id, hours \\ 24) when is_integer(hours) and hours > 0 do
    sql = """
    SELECT
      toStartOfHour(occurred_at) AS hour,
      count()                    AS views
    FROM post_events
    WHERE
      tweet_id   = {tweet_id:String}
      AND event_type = 'view'
      AND occurred_at >= now() - toIntervalHour({hours:UInt32})
    GROUP BY hour
    ORDER BY hour ASC
    """

    case ClickhouseRepo.query(sql, %{"tweet_id" => tweet_id, "hours" => hours}) do
      {:ok, %{rows: rows}} ->
        {:ok, Enum.map(rows, fn [hour, views] -> %{hour: hour, views: views} end)}

      {:error, reason} ->
        Logger.error("[Mixer.Metrics] get_hourly_views failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Return the top `limit` tweets ordered by total view count across all time.

  ## Example

      {:ok, rows} = Mixer.Metrics.get_top_posts(10)
      # => [%{tweet_id: "...", views: 99}, %{tweet_id: "...", views: 72}, ...]
  """
  @spec get_top_posts(pos_integer()) :: {:ok, [map()]} | {:error, term()}
  def get_top_posts(limit \\ 10) when is_integer(limit) and limit > 0 do
    sql = """
    SELECT
      tweet_id,
      countIf(event_type = 'view') AS views
    FROM post_events
    GROUP BY tweet_id
    ORDER BY views DESC
    LIMIT {limit:UInt32}
    """

    case ClickhouseRepo.query(sql, %{"limit" => limit}) do
      {:ok, %{rows: rows}} ->
        {:ok, Enum.map(rows, fn [tweet_id, views] -> %{tweet_id: tweet_id, views: views} end)}

      {:error, reason} ->
        Logger.error("[Mixer.Metrics] get_top_posts failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Return per-event-type counts for a list of tweet IDs in a single query.

  Handy for batch-enriching a feed with metrics without N+1 queries.

  ## Example

      {:ok, map} = Mixer.Metrics.get_bulk_summaries(tweet_ids)
      # => %{"<uuid>" => %{views: 5, likes: 2, ...}, ...}
  """
  @spec get_bulk_summaries([binary()]) :: {:ok, %{binary() => map()}} | {:error, term()}
  def get_bulk_summaries([]), do: {:ok, %{}}

  def get_bulk_summaries(tweet_ids) when is_list(tweet_ids) do
    # ecto_ch supports passing arrays as query parameters
    sql = """
    SELECT
      tweet_id,
      countIf(event_type = 'view')    AS views,
      countIf(event_type = 'like')    AS likes,
      countIf(event_type = 'unlike')  AS unlikes,
      countIf(event_type = 'comment') AS comments,
      countIf(event_type = 'share')   AS shares
    FROM post_events
    WHERE tweet_id IN {tweet_ids:Array(String)}
    GROUP BY tweet_id
    """

    case ClickhouseRepo.query(sql, %{"tweet_ids" => tweet_ids}) do
      {:ok, %{rows: rows}} ->
        summaries =
          Map.new(rows, fn [tweet_id, views, likes, unlikes, comments, shares] ->
            {tweet_id,
             %{
               views: views,
               likes: likes,
               unlikes: unlikes,
               comments: comments,
               shares: shares
             }}
          end)

        {:ok, summaries}

      {:error, reason} ->
        Logger.error("[Mixer.Metrics] get_bulk_summaries failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp enqueue(event_type, tweet_id, opts) do
    event = %{
      event_type: event_type,
      tweet_id: tweet_id,
      user_id: Keyword.get(opts, :user_id),
      occurred_at: DateTime.utc_now() |> DateTime.truncate(:second),
      ip_address: opts |> Keyword.get(:ip_address) |> format_ip()
    }

    Buffer.track(event)
  end

  defp format_ip(nil), do: nil
  defp format_ip(ip) when is_binary(ip), do: ip

  defp format_ip({a, b, c, d}), do: "#{a}.#{b}.#{c}.#{d}"

  defp format_ip({a, b, c, d, e, f, g, h}) do
    [a, b, c, d, e, f, g, h]
    |> Enum.map_join(":", &Integer.to_string(&1, 16))
  end

  defp row_to_summary(%{rows: [[views, likes, unlikes, comments, shares] | _]}) do
    %{
      views: views,
      likes: likes,
      unlikes: unlikes,
      comments: comments,
      shares: shares
    }
  end

  # ClickHouse returns no rows when the tweet has zero events — default to 0
  defp row_to_summary(_), do: %{views: 0, likes: 0, unlikes: 0, comments: 0, shares: 0}
end
