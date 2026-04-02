defmodule Mixer.Accounts do
  use Ash.Domain, otp_app: :mixer, extensions: [AshTypescript.Rpc, AshAdmin.Domain]

  admin do
    show? true
  end

  resources do
    resource Mixer.Accounts.Token
    resource Mixer.Accounts.User
    resource Mixer.Accounts.ApiKey
  end

  typescript_rpc do
    resource Mixer.Accounts.User do
      rpc_action :read_user, :read
    end
  end
end
