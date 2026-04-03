defmodule Mixer.Accounts.Follow do
  require Ash.Query
  use Ash.Resource,
    domain: Mixer.Accounts,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshTypescript.Resource]

  postgres do
    table "follows"
    repo Mixer.Repo

    references do
      reference :follower, on_delete: :delete
      reference :following, on_delete: :delete
    end
  end

  typescript do
    type_name "follows"
  end

  attributes do
    uuid_primary_key :id
    create_timestamp :created_at
  end

  relationships do
    belongs_to :follower, Mixer.Accounts.User do
      primary_key? true
      allow_nil? false
      attribute_writable? true
    end

    belongs_to :following, Mixer.Accounts.User do
      primary_key? true
      allow_nil? false
      attribute_writable? true
    end
  end

  actions do
    defaults [:read, :destroy]

    create :follow do
      primary? true
      upsert? true
      upsert_identity :unique_follow
      accept [:following_id]
      change relate_actor(:follower)
      validate fn changeset, _context ->
        follower_id = Ash.Changeset.get_attribute(changeset, :follower_id)
        following_id = Ash.Changeset.get_attribute(changeset, :following_id)

        if follower_id == following_id do
          {:error, field: :following_id, message: "You cannot follow yourself"}
        else
          :ok
        end
      end
    end

    action :unfollow do
      argument :following_id, :uuid, allow_nil?: false

      run fn input, context ->
        actor = context.actor

        Mixer.Accounts.Follow
        |> Ash.Query.filter(
          Ash.Expr.expr(
            follower_id == ^actor.id and following_id == ^input.arguments.following_id
          )
        )
        |> Ash.read_one(authorize?: false)
        |> case do
          {:ok, nil} -> :ok
          {:ok, follow} -> Ash.destroy(follow, authorize?: false)
          {:error, error} -> {:error, error}
        end
      end
    end
  end

  identities do
    identity :unique_follow, [:follower_id, :following_id]
  end

  policies do
    policy action_type(:read) do
      authorize_if always()
    end

    policy action(:follow) do
      authorize_if actor_present()
    end

    policy action(:unfollow) do
      authorize_if actor_present()
    end
  end
end
