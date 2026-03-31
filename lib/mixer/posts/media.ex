defmodule Mixer.Posts.Media do
  use Ash.Resource,
    otp_app: :mixer,
    domain: Mixer.Posts,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [
      AshTypescript.Resource
    ]

  postgres do
    table "media"
    repo Mixer.Repo

    references do
      reference :tweet, on_delete: :delete
    end
  end

  typescript do
    type_name "media"
  end

  actions do
    defaults [:read]

    create :upload do
      accept [:s3_key]
      change relate_actor(:user)
    end

    update :link_to_tweet do
      accept [:tweet_id]
    end

    destroy :destroy do
      primary? true
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :s3_key, :string do
      allow_nil? false
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end
  end

  relationships do
    belongs_to :user, Mixer.Accounts.User do
      attribute_writable? true
      allow_nil? false
      public? true
    end

    belongs_to :tweet, Mixer.Posts.Tweet do
      allow_nil? true
      public? true
    end
  end

  policies do
    policy action_type(:read) do
      authorize_if always()
    end

    policy action(:upload) do
      authorize_if actor_present()
    end

    policy action(:link_to_tweet) do
      authorize_if relates_to_actor_via(:user)
    end

    policy action_type(:destroy) do
      authorize_if relates_to_actor_via(:user)
    end
  end
end
