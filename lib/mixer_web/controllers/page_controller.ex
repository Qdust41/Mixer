defmodule MixerWeb.PageController do
  use MixerWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end

  def index(conn, _params) do
    render_spa(conn, nil)
  end

  def show(conn, %{"tweet_id" => tweet_id}) do
    render_spa(conn, tweet_id)
  end

  defp render_spa(conn, tweet_id) do
    asset_host = Application.get_env(:waffle, :asset_host, "http://localhost:3900")
    bucket = Application.get_env(:waffle, :bucket, "mixer-bucket")

    conn
    |> put_root_layout(html: {MixerWeb.Layouts, :spa_root})
    |> render(:index,
        current_user: conn.assigns[:current_user],
        media_host: "#{asset_host}/#{bucket}",
        tweet_id: tweet_id
      )
  end
end
