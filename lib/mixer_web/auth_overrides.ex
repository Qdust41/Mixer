defmodule MixerWeb.AuthOverrides do
  use AshAuthentication.Phoenix.Overrides

  # configure your UI overrides here

  # First argument to `override` is the component name you are overriding.
  # The body contains any number of configurations you wish to override
  # Below are some examples

  # For a complete reference, see https://hexdocs.pm/ash_authentication_phoenix/ui-overrides.html

  override AshAuthentication.Phoenix.Components.Banner do
    set :image_url, nil
    set :dark_image_url, nil
    set :text, "⬡ Mixer"
    set :text_class, "text-3xl font-bold tracking-tight"
  end

  # Inject the username field into the password registration form
  override AshAuthentication.Phoenix.Components.Password do
    set :register_extra_component, &MixerWeb.AuthComponents.username_field/1
  end
end
