defmodule MixerWeb.PageControllerTest do
  use MixerWeb.ConnCase

  test "GET / redirects to /feed when logged in", %{conn: conn} do
    user =
      Mixer.Accounts.User
      |> Ash.Changeset.for_create(
        :register_with_password,
        %{
          email: "test@example.com",
          password: "Password1!",
          password_confirmation: "Password1!",
          username: "testuser"
        },
        authorize?: false
      )
      |> Ash.create!()

    conn =
      conn
      |> Plug.Test.init_test_session(%{})
      |> AshAuthentication.Plug.Helpers.store_in_session(user)
      |> get(~p"/")

    assert redirected_to(conn) == ~p"/feed"
  end

  test "GET / renders the home page for unauthenticated users", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert html_response(conn, 200) =~ "Mixer"
  end
end
