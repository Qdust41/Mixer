defmodule MixerWeb.AshTypescriptRpcController do
  use MixerWeb, :controller

  def run(conn, params) do
    result = AshTypescript.Rpc.run_action(:mixer, conn, params)
    json(conn, result)
  end

  def validate(conn, params) do
    result = AshTypescript.Rpc.validate_action(:mixer, conn, params)
    json(conn, result)
  end
end
