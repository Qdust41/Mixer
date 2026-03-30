defmodule Mixer.Secrets do
  use AshAuthentication.Secret

  def secret_for(
        [:authentication, :tokens, :signing_secret],
        Mixer.Accounts.User,
        _opts,
        _context
      ) do
    Application.fetch_env(:mixer, :token_signing_secret)
  end
end
