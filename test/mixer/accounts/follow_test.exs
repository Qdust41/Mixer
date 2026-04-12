defmodule Mixer.Accounts.FollowTest do
  use Mixer.DataCase, async: true

  require Ash.Query

  alias Mixer.Accounts.Follow
  alias Mixer.Accounts.User

  describe "follow" do
    test "a user can follow another user" do
      alice = user_fixture("alice@example.com", "alice")
      bob = user_fixture("bob@example.com", "bob")

      assert {:ok, follow} =
               Follow
               |> Ash.Changeset.for_create(:follow, %{following_id: bob.id}, actor: alice)
               |> Ash.create()

      assert follow.follower_id == alice.id
      assert follow.following_id == bob.id
    end

    test "following the same user twice is a noop (upsert)" do
      alice = user_fixture("alice2@example.com", "alice2")
      bob = user_fixture("bob2@example.com", "bob2")

      assert {:ok, _} =
               Follow
               |> Ash.Changeset.for_create(:follow, %{following_id: bob.id}, actor: alice)
               |> Ash.create()

      assert {:ok, _} =
               Follow
               |> Ash.Changeset.for_create(:follow, %{following_id: bob.id}, actor: alice)
               |> Ash.create()

      assert count_follows(alice.id, bob.id) == 1
    end

    test "a user cannot follow themselves" do
      alice = user_fixture("alice3@example.com", "alice3")

      assert {:error, error} =
               Follow
               |> Ash.Changeset.for_create(:follow, %{following_id: alice.id}, actor: alice)
               |> Ash.create()

      assert Exception.message(error) =~ "cannot follow yourself"
    end

    test "guests cannot follow" do
      bob = user_fixture("bob3@example.com", "bob3")

      assert {:error, _error} =
               Follow
               |> Ash.Changeset.for_create(:follow, %{following_id: bob.id})
               |> Ash.create()
    end
  end

  describe "unfollow" do
    test "a user can unfollow someone they follow" do
      alice = user_fixture("alice4@example.com", "alice4")
      bob = user_fixture("bob4@example.com", "bob4")

      Follow
      |> Ash.Changeset.for_create(:follow, %{following_id: bob.id}, actor: alice)
      |> Ash.create!()

      assert count_follows(alice.id, bob.id) == 1

      assert :ok =
               Follow
               |> Ash.ActionInput.for_action(:unfollow, %{following_id: bob.id}, actor: alice)
               |> Ash.run_action()

      assert count_follows(alice.id, bob.id) == 0
    end

    test "unfollowing when not following is a noop" do
      alice = user_fixture("alice5@example.com", "alice5")
      bob = user_fixture("bob5@example.com", "bob5")

      assert :ok =
               Follow
               |> Ash.ActionInput.for_action(:unfollow, %{following_id: bob.id}, actor: alice)
               |> Ash.run_action()

      assert count_follows(alice.id, bob.id) == 0
    end

    test "guests cannot unfollow" do
      bob = user_fixture("bob6@example.com", "bob6")

      assert {:error, error} =
               Follow
               |> Ash.ActionInput.for_action(:unfollow, %{following_id: bob.id})
               |> Ash.run_action()

      assert Exception.message(error) =~ "forbidden"
    end
  end

  describe "follower/following counts" do
    test "follower_count and following_count reflect current follows" do
      alice = user_fixture("alice6@example.com", "alice6")
      bob = user_fixture("bob7@example.com", "bob7")
      carol = user_fixture("carol@example.com", "carol")

      Follow
      |> Ash.Changeset.for_create(:follow, %{following_id: bob.id}, actor: alice)
      |> Ash.create!()

      Follow
      |> Ash.Changeset.for_create(:follow, %{following_id: carol.id}, actor: alice)
      |> Ash.create!()

      Follow
      |> Ash.Changeset.for_create(:follow, %{following_id: bob.id}, actor: carol)
      |> Ash.create!()

      alice_loaded = User |> Ash.get!(alice.id, load: [:follower_count, :following_count], authorize?: false)
      bob_loaded = User |> Ash.get!(bob.id, load: [:follower_count, :following_count], authorize?: false)

      assert alice_loaded.following_count == 2
      assert alice_loaded.follower_count == 0
      assert bob_loaded.follower_count == 2
      assert bob_loaded.following_count == 0
    end

    test "am_i_following reflects the actor's follow status" do
      alice = user_fixture("alice7@example.com", "alice7")
      bob = user_fixture("bob8@example.com", "bob8")

      not_following =
        User |> Ash.get!(bob.id, actor: alice, load: [:am_i_following], authorize?: false)

      refute not_following.am_i_following

      Follow
      |> Ash.Changeset.for_create(:follow, %{following_id: bob.id}, actor: alice)
      |> Ash.create!()

      following =
        User |> Ash.get!(bob.id, actor: alice, load: [:am_i_following], authorize?: false)

      assert following.am_i_following
    end
  end

  # ── fixtures ──────────────────────────────────────────────────────────────

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

  defp count_follows(follower_id, following_id) do
    Follow
    |> Ash.Query.filter(
      Ash.Expr.expr(follower_id == ^follower_id and following_id == ^following_id)
    )
    |> Ash.read!(authorize?: false)
    |> length()
  end
end
