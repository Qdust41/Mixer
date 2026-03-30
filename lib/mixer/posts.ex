defmodule Mixer.Posts do
  use Ash.Domain,
    otp_app: :mixer,
    extensions: [AshTypescript.Rpc, AshAdmin.Domain]

  admin do
    show? true
  end

  resources do
    resource Mixer.Posts.Tweet
    resource Mixer.Posts.Media
  end

  typescript_rpc do
    resource Mixer.Posts.Tweet do
      rpc_action :create_tweet, :create
      rpc_action :read_tweet, :read
      rpc_action :update_tweet, :update
      rpc_action :destroy_tweet, :destroy
    end
  end
end
