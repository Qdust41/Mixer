defmodule Mixer.ClickhouseRepo do
  @moduledoc """
  Ecto repository for ClickHouse, backed by the `ecto_ch` / `Ch` adapter.

  Used exclusively for analytics writes (via `Mixer.Metrics.Buffer`) and
  read queries (via `Mixer.Metrics`). It is **not** an Ash repo and must
  never be used for transactional application data.
  """

  use Ecto.Repo,
    otp_app: :mixer,
    adapter: Ecto.Adapters.ClickHouse
end
