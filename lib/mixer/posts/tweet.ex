defmodule Mixer.Posts.Tweet do
  import Ash.Expr
  require Ash.Query

  use Ash.Resource,
    otp_app: :mixer,
    domain: Mixer.Posts,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshStateMachine, AshTypescript.Resource]

  postgres do
    table "tweets"
    repo Mixer.Repo

    references do
      reference :parent_tweet, on_delete: :delete
    end
  end

  state_machine do
    initial_states [:drafted, :posted]
    default_initial_state :drafted

    transitions do
      transition :create, from: :*, to: :posted
    end
  end

  typescript do
    type_name "tweets"
  end

  actions do
    defaults [:read, :destroy]

    read :following_feed do
      filter expr(
               user_id == ^actor(:id) or
                 exists(user.followers, follower_id == ^actor(:id))
             )
    end

    create :create do
      upsert? true
      accept [:content, :parent_tweet_id]
      argument :media_id, :uuid, allow_nil?: true
      change relate_actor(:user)
      change transition_state(:posted)

      change fn changeset, context ->
        case Ash.Changeset.get_argument(changeset, :media_id) do
          nil ->
            changeset

          media_id ->
            Ash.Changeset.after_action(changeset, fn _changeset, tweet ->
              Mixer.Posts.Media
              |> Ash.get!(media_id, authorize?: false)
              |> Ash.Changeset.for_update(:link_to_tweet, %{tweet_id: tweet.id},
                actor: context.actor
              )
              |> Ash.update!()

              {:ok, tweet}
            end)
        end
      end
    end

    update :update do
      accept [:content]
    end

    update :like do
      accept []
      require_atomic? false

      change fn changeset, context ->
        Ash.Changeset.after_action(changeset, fn _changeset, tweet ->
          case ensure_like(tweet, context.actor) do
            {:created, _like} ->
              increment_likes(tweet, context.actor)

            {:noop, _like} ->
              {:ok, tweet}

            {:error, error} ->
              {:error, error}
          end
        end)
      end
    end

    update :unlike do
      accept []
      require_atomic? false

      change fn changeset, context ->
        Ash.Changeset.after_action(changeset, fn _changeset, tweet ->
          case remove_like(tweet, context.actor) do
            {:deleted, _like} ->
              decrement_likes(tweet, context.actor)

            {:noop, _like} ->
              {:ok, tweet}

            {:error, error} ->
              {:error, error}
          end
        end)
      end
    end

    update :increment_likes do
      accept []
      require_atomic? false
      change atomic_update(:likes, expr(likes + 1))
    end

    update :decrement_likes do
      accept []
      require_atomic? false
      change atomic_update(:likes, expr(likes - 1))
    end
  end

  policies do
    policy action_type(:read) do
      authorize_if always()
    end

    policy action_type(:create) do
      authorize_if actor_present()
    end

    policy action(:update) do
      authorize_if relates_to_actor_via(:user)
    end

    policy action(:destroy) do
      authorize_if relates_to_actor_via(:user)
      authorize_if relates_to_actor_via([:parent_tweet, :user])
    end

    policy action(:like) do
      authorize_if actor_present()
    end

    policy action(:unlike) do
      authorize_if actor_present()
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

    create_timestamp :inserted_at do
      public? true
    end

    update_timestamp :updated_at
  end

  relationships do
    belongs_to :user, Mixer.Accounts.User do
      attribute_type :uuid
      attribute_writable? true
      allow_nil? false
      public? true
    end

    belongs_to :parent_tweet, Mixer.Posts.Tweet do
      attribute_type :uuid
      attribute_writable? true
      allow_nil? true
      public? true
    end

    has_many :comments, Mixer.Posts.Tweet do
      destination_attribute :parent_tweet_id
      public? true
    end

    has_many :media, Mixer.Posts.Media do
      public? true
    end

    has_many :tweet_likes, Mixer.Posts.TweetLike
  end

  calculations do
    calculate :user_email, :string, expr(user.email) do
      public? true
    end
  end

  aggregates do
    count :comment_count, :comments do
      public? true
    end

    exists :liked_by_me, :tweet_likes do
      public? true
      filter expr(user_id == ^actor(:id))
    end
  end

  defp ensure_like(_tweet, nil), do: {:error, Ash.Error.Forbidden.exception([])}

  defp ensure_like(tweet, actor) do
    case get_like(tweet.id, actor.id) do
      {:ok, nil} ->
        case create_like(tweet.id, actor) do
          {:ok, like} ->
            {:created, like}

          {:error, error} ->
            case get_like(tweet.id, actor.id) do
              {:ok, nil} ->
                {:error, error}

              {:ok, like} ->
                {:noop, like}

              {:error, error} ->
                {:error, error}
            end
        end

      {:ok, like} ->
        {:noop, like}

      {:error, error} ->
        {:error, error}
    end
  end

  defp remove_like(_tweet, nil), do: {:error, Ash.Error.Forbidden.exception([])}

  defp remove_like(tweet, actor) do
    case get_like(tweet.id, actor.id) do
      {:ok, nil} ->
        {:noop, nil}

      {:ok, like} ->
        case Ash.destroy(like, actor: actor) do
          :ok -> {:deleted, like}
          {:ok, _destroyed_like} -> {:deleted, like}
          {:error, error} -> {:error, error}
        end

      {:error, error} ->
        {:error, error}
    end
  end

  defp create_like(tweet_id, actor) do
    Mixer.Posts.TweetLike
    |> Ash.Changeset.for_create(:create, %{tweet_id: tweet_id}, actor: actor)
    |> Ash.create()
  end

  defp get_like(tweet_id, user_id) do
    Mixer.Posts.TweetLike
    |> Ash.Query.filter(expr(tweet_id == ^tweet_id and user_id == ^user_id))
    |> Ash.read_one(authorize?: false)
  end

  defp increment_likes(tweet, actor) do
    tweet
    |> Ash.Changeset.for_update(:increment_likes, %{}, actor: actor)
    |> Ash.update(authorize?: false)
  end

  defp decrement_likes(tweet, actor) do
    tweet
    |> Ash.Changeset.for_update(:decrement_likes, %{}, actor: actor)
    |> Ash.update(authorize?: false)
  end
end
