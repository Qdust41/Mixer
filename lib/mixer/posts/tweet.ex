defmodule Mixer.Posts.Tweet do
  use Ash.Resource,
    otp_app: :mixer,
    domain: Mixer.Posts,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshStateMachine, AshTypescript.Resource]

  postgres do
    table "tweets"
    repo Mixer.Repo
  end

  typescript do
    type_name "tweets"
  end

  state_machine do
    initial_states [:drafted, :posted]
    default_initial_state :drafted

    transitions do
      transition :create, from: :*, to: :posted
    end
  end

  actions do
    defaults [:read, :destroy, update: :*]

    create :create do
      upsert? true
      accept [:content]
      change relate_actor(:user)
      change transition_state(:posted)
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :content, :string do
      allow_nil? false
      public? true
    end

    attribute :likes, :integer do
      allow_nil? false
      default 0
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end
  end

  relationships do
    belongs_to :user, Mixer.Accounts.User do
      attribute_type :uuid
      attribute_writable? true
      allow_nil? false
      public? true
    end

    has_many :s3_key, Mixer.Posts.Media do
      public? true
    end
  end

  policies do
    policy action_type(:read) do
      authorize_if always()
    end

    policy action_type(:create) do
      authorize_if actor_present()
    end

    policy action_type([:destroy, :update]) do
      authorize_if relates_to_actor_via(:user)
    end
  end
end
