defmodule Mixer.Posts do
  use Ash.Domain,
    otp_app: :mixer,
    extensions: [AshTypescript.Rpc, AshAdmin.Domain]

  typescript_rpc do
    resource Mixer.Posts.Tweet do
      rpc_action :create_tweet, :create
      rpc_action :like_tweet, :like
      rpc_action :read_tweet, :read
      rpc_action :unlike_tweet, :unlike
      rpc_action :update_tweet, :update
      rpc_action :destroy_tweet, :destroy
    end

    resource Mixer.Posts.Media do
      rpc_action :read_media, :read
    end
  end

  admin do
    show? true
  end

  resources do
    resource Mixer.Posts.Tweet
    resource Mixer.Posts.TweetLike
    resource Mixer.Posts.Media
  end
end
