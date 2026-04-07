defmodule Mixer.Metrics.Buffer do
  @moduledoc """
  GenServer that accumulates post metric events in memory and flushes them
  to ClickHouse in batches.

  Two conditions trigger a flush:

  1. **Timer** — every `@flush_interval` milliseconds (default 10 s).
  2. **Threshold** — whenever the in-memory buffer reaches `@max_buffer_size`
     rows (default 500).

  If ClickHouse is unavailable the error is logged and the buffered events
  are discarded rather than retried indefinitely, preventing unbounded memory
  growth. For production deployments that require durability, consider adding
  a persistent queue in front of this buffer.
  """

  use GenServer

  require Logger

  alias Mixer.Metrics.PostEvent

  @flush_interval :timer.seconds(10)
  @max_buffer_size 500

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  @doc """
  Start the buffer process and link it to the calling process.

  Accepts an optional keyword list of overrides:

    * `:flush_interval` — milliseconds between scheduled flushes
    * `:max_buffer_size` — row count that triggers an immediate flush
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Enqueue a single analytics event map for buffered insertion into ClickHouse.

  The map must contain at minimum the fields required by `Mixer.Metrics.PostEvent`:
  `:event_type`, `:tweet_id`, `:occurred_at`. Other fields are optional.

  This call is asynchronous (cast) and returns `:ok` immediately.
  """
  @spec track(map()) :: :ok
  def track(event) when is_map(event) do
    GenServer.cast(__MODULE__, {:track, event})
  end

  @doc """
  Force an immediate flush of all buffered events to ClickHouse, regardless
  of the timer or threshold. Returns `:ok` after the flush completes.

  Primarily useful in tests.
  """
  @spec flush() :: :ok
  def flush do
    GenServer.call(__MODULE__, :flush)
  end

  # ---------------------------------------------------------------------------
  # GenServer callbacks
  # ---------------------------------------------------------------------------

  @impl GenServer
  def init(opts) do
    flush_interval = Keyword.get(opts, :flush_interval, @flush_interval)
    max_buffer_size = Keyword.get(opts, :max_buffer_size, @max_buffer_size)

    schedule_flush(flush_interval)

    state = %{
      events: [],
      count: 0,
      flush_interval: flush_interval,
      max_buffer_size: max_buffer_size
    }

    {:ok, state}
  end

  @impl GenServer
  def handle_cast({:track, event}, state) do
    new_count = state.count + 1
    new_events = [event | state.events]

    if new_count >= state.max_buffer_size do
      do_flush(new_events)
      {:noreply, %{state | events: [], count: 0}}
    else
      {:noreply, %{state | events: new_events, count: new_count}}
    end
  end

  @impl GenServer
  def handle_call(:flush, _from, state) do
    do_flush(state.events)
    {:reply, :ok, %{state | events: [], count: 0}}
  end

  @impl GenServer
  def handle_info(:flush, state) do
    do_flush(state.events)
    schedule_flush(state.flush_interval)
    {:noreply, %{state | events: [], count: 0}}
  end

  @impl GenServer
  def terminate(_reason, state) do
    # Best-effort flush on shutdown so we don't lose buffered events during
    # graceful stops (e.g., deploys).
    do_flush(state.events)
    :ok
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp do_flush([]), do: :ok

  defp do_flush(events) do
    rows = Enum.reverse(events)
    count = length(rows)

    try do
      # ClickHouse async inserts acknowledge writes immediately and always
      # return num_rows: 0 — the data is queued for background commitment.
      # We use our own row count for the log so it is always accurate.
      Mixer.ClickhouseRepo.insert_all(PostEvent, rows)
      Logger.debug("[Mixer.Metrics.Buffer] Flushed #{count} event(s) to ClickHouse")
    rescue
      error ->
        Logger.error(
          "[Mixer.Metrics.Buffer] Failed to flush #{count} event(s) to ClickHouse: " <>
            Exception.message(error)
        )
    end
  end

  defp schedule_flush(interval) do
    Process.send_after(self(), :flush, interval)
  end
end
