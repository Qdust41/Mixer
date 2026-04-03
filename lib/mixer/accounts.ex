defmodule Mixer.Accounts do
  use Ash.Domain, otp_app: :mixer, extensions: [AshTypescript.Rpc, AshAdmin.Domain]

  typescript_rpc do
    resource Mixer.Accounts.User do
      rpc_action :read_user, :read
    end

    resource Mixer.Accounts.Follow do
      rpc_action :read_follow, :read
      rpc_action :follow_user, :follow
      rpc_action :unfollow_user, :unfollow
    end
  end

  admin do
    show? true
  end

  resources do
    resource Mixer.Accounts.Token
    resource Mixer.Accounts.User
    resource Mixer.Accounts.ApiKey

    resource Mixer.Accounts.Follow
  end
end
