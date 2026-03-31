defmodule Mixer.Posts.TweetLike do
  use Ash.Resource,
    otp_app: :mixer,
    domain: Mixer.Posts,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer]

  postgres do
    table "tweet_likes"
    repo Mixer.Repo
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      accept [:tweet_id]
      change relate_actor(:user)
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :tweet_id, :uuid do
      allow_nil? false
    end

    attribute :user_id, :uuid do
      allow_nil? false
    end
  end

  relationships do
    belongs_to :tweet, Mixer.Posts.Tweet do
      attribute_type :uuid
      attribute_writable? true
      allow_nil? false
    end

    belongs_to :user, Mixer.Accounts.User do
      attribute_type :uuid
      attribute_writable? true
      allow_nil? false
    end
  end

  identities do
    identity :unique_user_tweet, [:tweet_id, :user_id]
  end

  policies do
    policy action_type(:read) do
      authorize_if always()
    end

    policy action(:create) do
      authorize_if actor_present()
    end

    policy action_type(:destroy) do
      authorize_if relates_to_actor_via(:user)
    end
  end
end
