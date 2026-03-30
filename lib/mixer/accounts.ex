defmodule Mixer.Accounts do
  use Ash.Domain, otp_app: :mixer, extensions: [AshAdmin.Domain]

  admin do
    show? true
  end

  resources do
    resource Mixer.Accounts.Token
    resource Mixer.Accounts.User
    resource Mixer.Accounts.ApiKey
  end
end
