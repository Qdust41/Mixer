defmodule MixerWeb.PageController do
  use MixerWeb, :controller

  def home(conn, _params) do
    if conn.assigns[:current_user] do
      redirect(conn, to: ~p"/feed")
    else
      render(conn, :home)
    end
  end

  def index(conn, _params) do
    render_spa(conn, %{page: "feed", tweet_id: nil, user_id: nil})
  end

  def show(conn, %{"tweet_id" => tweet_id}) do
    render_spa(conn, %{page: "tweet", tweet_id: tweet_id, user_id: nil})
  end

  def following(conn, _params) do
    render_spa(conn, %{page: "following", tweet_id: nil, user_id: nil})
  end

  def users_index(conn, _params) do
    render_spa(conn, %{page: "users", tweet_id: nil, user_id: nil})
  end

  def user_show(conn, %{"user_id" => user_id}) do
    render_spa(conn, %{page: "user-detail", tweet_id: nil, user_id: user_id})
  end

  defp render_spa(conn, %{page: page, tweet_id: tweet_id, user_id: user_id}) do
    asset_host = Application.get_env(:waffle, :asset_host, "http://localhost:3900")
    bucket = Application.get_env(:waffle, :bucket, "mixer-bucket")

    conn
    |> put_root_layout(html: {MixerWeb.Layouts, :spa_root})
    |> render(:index,
      current_user: conn.assigns[:current_user],
      media_host: "#{asset_host}/#{bucket}",
      page: page,
      tweet_id: tweet_id,
      user_id: user_id
    )
  end
end
