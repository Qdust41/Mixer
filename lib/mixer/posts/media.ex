defmodule Mixer.Posts.Media do
  use Ash.Resource,
    otp_app: :mixer,
    domain: Mixer.Posts,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [
      #AshStateMachine,
      AshTypescript.Resource
    ]

  postgres do
    table "media"
    repo Mixer.Repo
  end

  typescript do
    type_name "media"
  end

  actions do
    defaults [:read, :destroy, create: :*, update: :*]
  end

  attributes do
    uuid_primary_key :id

    attribute :s3_key, :string do
      allow_nil? false
      public? true
    end
  end

  relationships do
    belongs_to :tweet, Mixer.Posts.Tweet do
      allow_nil? false
      public? true
    end
  end
end
