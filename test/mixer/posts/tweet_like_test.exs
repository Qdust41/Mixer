defmodule Mixer.Posts.TweetLikeTest do
  use Mixer.DataCase, async: true

  import Ash.Expr
  require Ash.Query

  alias Mixer.Accounts.User
  alias Mixer.Posts.Tweet
  alias Mixer.Posts.TweetLike

  describe "tweet likes" do
    test "a user can like a tweet once and liked_by_me reflects the actor" do
      user = user_fixture("liker@example.com")
      tweet = tweet_fixture(user, "first post")

      assert {:ok, liked_tweet} =
               tweet
               |> Ash.Changeset.for_update(:like, %{}, actor: user)
               |> Ash.update()

      assert liked_tweet.likes == 1
      assert count_likes(tweet.id) == 1

      tweet_for_actor =
        Tweet
        |> Ash.get!(tweet.id, actor: user, load: [:liked_by_me], authorize?: false)

      refute match?(%Ash.ForbiddenField{}, tweet_for_actor.liked_by_me)
      assert tweet_for_actor.liked_by_me

      tweet_without_actor =
        Tweet
        |> Ash.get!(tweet.id, load: [:liked_by_me], authorize?: false)

      refute match?(%Ash.ForbiddenField{}, tweet_without_actor.liked_by_me)
      refute tweet_without_actor.liked_by_me
    end

    test "liking the same tweet twice does not create duplicate rows or inflate the counter" do
      user = user_fixture("duplicate@example.com")
      tweet = tweet_fixture(user, "duplicate like test")

      assert {:ok, _tweet} =
               tweet
               |> Ash.Changeset.for_update(:like, %{}, actor: user)
               |> Ash.update()

      assert {:ok, liked_again} =
               tweet
               |> Ash.Changeset.for_update(:like, %{}, actor: user)
               |> Ash.update()

      assert liked_again.likes == 1
      assert count_likes(tweet.id) == 1
    end

    test "unliking removes the relation and decrements the counter without going negative" do
      user = user_fixture("unlike@example.com")
      tweet = tweet_fixture(user, "unlike test")

      tweet
      |> Ash.Changeset.for_update(:like, %{}, actor: user)
      |> Ash.update!()

      assert {:ok, unliked_tweet} =
               tweet
               |> Ash.Changeset.for_update(:unlike, %{}, actor: user)
               |> Ash.update()

      assert unliked_tweet.likes == 0
      assert count_likes(tweet.id) == 0

      assert {:ok, still_unliked} =
               tweet
               |> Ash.Changeset.for_update(:unlike, %{}, actor: user)
               |> Ash.update()

      assert still_unliked.likes == 0
      assert count_likes(tweet.id) == 0
    end

    test "guests cannot like tweets" do
      owner = user_fixture("owner@example.com")
      tweet = tweet_fixture(owner, "guest like test")

      assert {:error, error} =
               tweet
               |> Ash.Changeset.for_update(:like, %{})
               |> Ash.update()

      assert Exception.message(error) =~ "forbidden"
      assert count_likes(tweet.id) == 0
    end
  end

  defp user_fixture(email) do
    username =
      email |> String.split("@") |> List.first() |> String.replace(~r/[^a-zA-Z0-9_]/, "_")

    User
    |> Ash.Changeset.for_create(:register_with_password, %{
      email: email,
      password: "password1234",
      password_confirmation: "password1234",
      username: username
    })
    |> Ash.create!(authorize?: false)
  end

  defp tweet_fixture(user, content) do
    Tweet
    |> Ash.Changeset.for_create(:create, %{content: content}, actor: user)
    |> Ash.create!()
  end

  defp count_likes(tweet_id) do
    TweetLike
    |> Ash.Query.filter(expr(tweet_id == ^tweet_id))
    |> Ash.read!(authorize?: false)
    |> length()
  end
end
