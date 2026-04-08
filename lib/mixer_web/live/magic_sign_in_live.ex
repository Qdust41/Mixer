defmodule MixerWeb.MagicSignInLive do
  @moduledoc """
  Custom magic-link sign-in LiveView that collects a username for new users.

  When a user clicks their magic link, this page is shown instead of the
  default auto-submit. If the user is brand new (no account) or has no
  username set yet, we ask them to choose one before completing sign-in.
  """

  use AshAuthentication.Phoenix.Overrides.Overridable,
    root_class: "CSS class for the root `div` element.",
    magic_sign_in_id: "Element ID for the `MagicSignIn` LiveComponent."

  use AshAuthentication.Phoenix.Web, :live_view

  alias AshAuthentication.Info
  alias AshPhoenix.Form
  alias Phoenix.LiveView.{Rendered, Socket}

  import AshAuthentication.Phoenix.Components.Helpers, only: [auth_path: 5]
  import PhoenixHTMLHelpers.Form, only: [hidden_input: 3, submit: 2]
  import Slug

  @doc false
  @impl true
  def mount(params, session, socket) do
    overrides =
      session
      |> Map.get("overrides", [AshAuthentication.Phoenix.Overrides.Default])

    resource = session["resource"]
    strategy_name = session["strategy"]
    token = params["token"] || params["magic_link"]

    strategy = Info.strategy!(resource, strategy_name)
    subject_name = Info.authentication_subject_name!(resource)
    domain = Info.authentication_domain!(resource)

    # Determine whether this user needs to pick a username
    needs_username? = needs_username?(token, resource)

    form =
      resource
      |> Form.for_action(strategy.sign_in_action_name,
        domain: domain,
        as: subject_name |> to_string(),
        id: "#{subject_name}-#{strategy_name}-sign-in-form" |> slugify(),
        context: %{strategy: strategy, private: %{ash_authentication?: true}}
      )

    socket =
      socket
      |> assign(overrides: overrides)
      |> assign(:token, token)
      |> assign(:strategy, strategy)
      |> assign(:subject_name, subject_name)
      |> assign(:resource, resource)
      |> assign(:needs_username?, needs_username?)
      |> assign(:form, form)
      |> assign(:trigger_action, false)
      |> assign(:current_tenant, session["tenant"])
      |> assign(:auth_routes_prefix, session["auth_routes_prefix"])

    {:ok, socket}
  end

  @doc false
  @impl true
  @spec handle_params(map, String.t(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_params(_params, _uri, socket), do: {:noreply, socket}

  @doc false
  @impl true
  @spec render(Socket.assigns()) :: Rendered.t()
  def render(assigns) do
    ~H"""
    <div class={override_for(@overrides, :root_class)}>
      <.live_component
        module={AshAuthentication.Phoenix.Components.Banner}
        id="magic-sign-in-banner"
        overrides={@overrides}
      />

      <div style="max-width: 400px; margin: 0 auto; padding: 1rem;">
        <.form
          :let={form}
          for={@form}
          phx-submit="submit"
          phx-trigger-action={@trigger_action}
          action={
            auth_path(
              @socket,
              @subject_name,
              @auth_routes_prefix,
              @strategy,
              :sign_in
            )
          }
          method="POST"
        >
          {hidden_input(form, :token, value: @token)}

          <%!-- Username field — only shown for new or username-less users --%>
          <div :if={@needs_username?} class="mt-2 mb-4">
            <label
              for={form[:username].id}
              class="block text-sm font-medium text-base-content mb-1"
            >
              Choose a username
            </label>
            <div class="flex">
              <span class="input rounded-r-none border-r-0 text-base-content/50 select-none">
                @
              </span>
              <input
                type="text"
                id={form[:username].id}
                name={form[:username].name}
                value={form[:username].value || ""}
                class={"input w-full rounded-l-none #{if form[:username].errors != [], do: "input-error", else: ""}"}
                placeholder="your_handle"
                autocomplete="username"
                required
              />
            </div>
            <p
              :if={form[:username].errors != []}
              class="mt-1 text-xs text-error"
            >
              {form[:username].errors |> List.first() |> elem(0)}
            </p>
            <p :if={form[:username].errors == []} class="mt-1 text-xs text-base-content/50">
              3–30 characters · letters, numbers, underscores
            </p>
          </div>

          {submit("Sign in",
            class: "btn btn-primary w-full mt-2",
            phx_disable_with: "Signing in…"
          )}
        </.form>
      </div>
    </div>
    """
  end

  @doc false
  @impl true
  @spec handle_event(String.t(), map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_event("submit", params, socket) do
    subject_name =
      socket.assigns.subject_name
      |> to_string()
      |> slugify()

    form_params = Map.get(params, subject_name, %{})

    form = Form.validate(socket.assigns.form, form_params)

    socket =
      socket
      |> assign(:form, form)
      |> assign(:trigger_action, form.valid?)

    {:noreply, socket}
  end

  # ── Helpers ──────────────────────────────────────────────────────────────────

  # Returns true if the user is new or has no username set yet.
  defp needs_username?(nil, _resource), do: true

  defp needs_username?(token, resource) do
    with {:ok, claims} <- AshAuthentication.Jwt.peek(token),
         subject when is_binary(subject) <- Map.get(claims, "sub"),
         {:ok, user} <- AshAuthentication.subject_to_user(subject, resource) do
      is_nil(user.username)
    else
      _ ->
        # Unknown / new user — ask for username to be safe
        true
    end
  end
end
