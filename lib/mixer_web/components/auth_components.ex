defmodule MixerWeb.AuthComponents do
  @moduledoc """
  Extra components injected into AshAuthentication.Phoenix forms.
  """

  use Phoenix.Component

  @doc """
  Renders a username input field inside the password registration form.

  Receives `form` (an `AshPhoenix.Form`) as an assign via the
  `register_extra_component` override.
  """
  def username_field(assigns) do
    field = assigns.form[:username]

    assigns =
      assigns
      |> assign(:field_id, field.id)
      |> assign(:field_name, field.name)
      |> assign(:field_value, field.value || "")
      |> assign(:field_errors, field.errors)

    ~H"""
    <div class="mt-2 mb-2">
      <label for={@field_id} class="block text-sm font-medium text-base-content mb-1">
        Username
      </label>
      <div class="flex">
        <span class="flex items-center justify-center px-4 bg-base-200 border border-base-300 border-r-0 rounded-l-lg text-base-content/50 select-none">@</span>
        <input
          type="text"
          id={@field_id}
          name={@field_name}
          value={@field_value}
          class={"input w-full rounded-l-none #{if @field_errors != [], do: "input-error", else: ""}"}
          placeholder="your_handle"
          required
        />
      </div>
      <p :for={error <- @field_errors} class="mt-1 text-xs text-error">
        {translate_error(error)}
      </p>
    </div>
    """
  end

  def translate_error({msg, opts}) do
    if count = opts[:count] do
      Gettext.dngettext(MixerWeb.Gettext, "errors", msg, msg, count, opts)
    else
      Gettext.dgettext(MixerWeb.Gettext, "errors", msg, opts)
    end
  end
end
