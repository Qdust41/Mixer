defmodule MixerWeb.PageController do
  use MixerWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end

  def index(conn, _params) do
    asset_host = Application.get_env(:waffle, :asset_host, "http://localhost:3900")
    bucket = Application.get_env(:waffle, :bucket, "mixer-bucket")

    conn
    |> put_root_layout(html: {MixerWeb.Layouts, :spa_root})
    |> render(:index,
        current_user: conn.assigns[:current_user],
        media_host: "#{asset_host}/#{bucket}"
      )
  end
end
