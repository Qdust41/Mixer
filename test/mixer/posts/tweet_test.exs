defmodule Mixer.Posts.TweetTest do
  use Mixer.DataCase, async: true

  require Ash.Query

  alias Mixer.Accounts.User
  alias Mixer.Posts.Tweet

  describe "tweet creation" do
    test "a user can create a tweet" do
      user = user_fixture("poster@example.com", "poster")

      assert {:ok, tweet} =
               Tweet
               |> Ash.Changeset.for_create(:create, %{content: "hello world"}, actor: user)
               |> Ash.create()

      assert tweet.content == "hello world"
      assert tweet.user_id == user.id
      assert tweet.state == :posted
      assert tweet.likes == 0
    end

    test "tweet content cannot be blank" do
      user = user_fixture("blank@example.com", "blankuser")

      assert {:error, error} =
               Tweet
               |> Ash.Changeset.for_create(:create, %{content: nil}, actor: user)
               |> Ash.create()

      assert Exception.message(error) =~ "content"
    end

    test "guests cannot create tweets" do
      assert {:error, _error} =
               Tweet
               |> Ash.Changeset.for_create(:create, %{content: "spam"})
               |> Ash.create()
    end

    test "all users can read tweets" do
      user = user_fixture("readable@example.com", "readable")

      Tweet
      |> Ash.Changeset.for_create(:create, %{content: "public post"}, actor: user)
      |> Ash.create!()

      tweets = Tweet |> Ash.read!(authorize?: false)
      assert length(tweets) >= 1
    end
  end

  describe "tweet update" do
    test "owner can edit their tweet" do
      user = user_fixture("editor@example.com", "editor")
      tweet = tweet_fixture(user, "original content")

      assert {:ok, updated} =
               tweet
               |> Ash.Changeset.for_update(:update, %{content: "edited content"}, actor: user)
               |> Ash.update()

      assert updated.content == "edited content"
    end

    test "non-owner cannot edit a tweet" do
      owner = user_fixture("owner@example.com", "tweetowner")
      other = user_fixture("other@example.com", "otheruser")
      tweet = tweet_fixture(owner, "owner's post")

      assert {:error, error} =
               tweet
               |> Ash.Changeset.for_update(:update, %{content: "hacked"}, actor: other)
               |> Ash.update()

      assert Exception.message(error) =~ "forbidden"
    end
  end

  describe "tweet deletion" do
    test "owner can delete their tweet" do
      user = user_fixture("deleter@example.com", "deleter")
      tweet = tweet_fixture(user, "to be deleted")

      assert :ok =
               tweet
               |> Ash.Changeset.for_destroy(:destroy, %{}, actor: user)
               |> Ash.destroy()

      assert {:ok, nil} = Tweet |> Ash.get(tweet.id, authorize?: false, not_found_error?: false)
    end

    test "non-owner cannot delete a tweet" do
      owner = user_fixture("owner2@example.com", "owner2")
      other = user_fixture("other2@example.com", "other2")
      tweet = tweet_fixture(owner, "protected post")

      assert {:error, error} =
               tweet
               |> Ash.Changeset.for_destroy(:destroy, %{}, actor: other)
               |> Ash.destroy()

      assert Exception.message(error) =~ "forbidden"
    end
  end

  describe "comments (replies)" do
    test "a user can reply to a tweet" do
      author = user_fixture("author@example.com", "author")
      replier = user_fixture("replier@example.com", "replier")
      parent = tweet_fixture(author, "parent post")

      assert {:ok, comment} =
               Tweet
               |> Ash.Changeset.for_create(
                 :create,
                 %{content: "great post!", parent_tweet_id: parent.id},
                 actor: replier
               )
               |> Ash.create()

      assert comment.parent_tweet_id == parent.id
      assert comment.user_id == replier.id
    end

    test "comment_count reflects number of replies" do
      author = user_fixture("countauthor@example.com", "countauthor")
      replier = user_fixture("countreplier@example.com", "countreplier")
      parent = tweet_fixture(author, "tweet with replies")

      Tweet
      |> Ash.Changeset.for_create(:create, %{content: "reply 1", parent_tweet_id: parent.id}, actor: replier)
      |> Ash.create!()

      Tweet
      |> Ash.Changeset.for_create(:create, %{content: "reply 2", parent_tweet_id: parent.id}, actor: replier)
      |> Ash.create!()

      loaded = Tweet |> Ash.get!(parent.id, load: [:comment_count], authorize?: false)
      assert loaded.comment_count == 2
    end

    test "tweet owner can delete a comment on their tweet" do
      author = user_fixture("tweetowner3@example.com", "tweetowner3")
      replier = user_fixture("commenter@example.com", "commenter")
      parent = tweet_fixture(author, "parent tweet")

      comment =
        Tweet
        |> Ash.Changeset.for_create(
          :create,
          %{content: "a comment", parent_tweet_id: parent.id},
          actor: replier
        )
        |> Ash.create!()

      # Tweet owner (author) can delete someone else's comment on their post
      assert :ok =
               comment
               |> Ash.Changeset.for_destroy(:destroy, %{}, actor: author)
               |> Ash.destroy()
    end

    test "a third party cannot delete a comment they don't own" do
      author = user_fixture("tweetowner4@example.com", "tweetowner4")
      replier = user_fixture("commenter2@example.com", "commenter2")
      bystander = user_fixture("bystander@example.com", "bystander")
      parent = tweet_fixture(author, "parent tweet 2")

      comment =
        Tweet
        |> Ash.Changeset.for_create(
          :create,
          %{content: "a comment", parent_tweet_id: parent.id},
          actor: replier
        )
        |> Ash.create!()

      assert {:error, error} =
               comment
               |> Ash.Changeset.for_destroy(:destroy, %{}, actor: bystander)
               |> Ash.destroy()

      assert Exception.message(error) =~ "forbidden"
    end

    test "guests cannot post comments" do
      author = user_fixture("tweetowner5@example.com", "tweetowner5")
      parent = tweet_fixture(author, "parent post 3")

      assert {:error, _error} =
               Tweet
               |> Ash.Changeset.for_create(
                 :create,
                 %{content: "spam comment", parent_tweet_id: parent.id}
               )
               |> Ash.create()
    end
  end

  # ── helpers ───────────────────────────────────────────────────────────────

  defp user_fixture(email, username) do
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
end
