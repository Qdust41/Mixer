defmodule MixerWeb.UploadController do
  use MixerWeb, :controller

  alias Mixer.Posts.MediaUploader
  alias Mixer.Accounts.AvatarUploader

  def create(conn, %{"file" => %Plug.Upload{} = upload}) do
    actor = conn.assigns[:current_user]

    unless actor do
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "authentication required"})
    else
      media_id = Ash.UUID.generate()
      scope = %{user_id: actor.id, media_id: media_id}

      case MediaUploader.store({upload, scope}) do
        {:ok, file_name} ->
          s3_key = "uploads/media/#{scope.user_id}/#{scope.media_id}/#{file_name}"
          url = MediaUploader.url({file_name, scope})

          Mixer.Posts.Media
          |> Ash.Changeset.for_create(:upload, %{s3_key: s3_key}, actor: actor)
          |> Ash.Changeset.force_change_attribute(:id, media_id)
          |> Ash.create()
          |> case do
            {:ok, media} ->
              json(conn, %{success: true, mediaId: media.id, url: url})

            {:error, error} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{success: false, error: inspect(error)})
          end

        {:error, reason} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{success: false, error: reason})
      end
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "no file provided"})
  end

  # ── Avatar upload ──────────────────────────────────────────────────────────

  def upload_avatar(conn, %{"file" => %Plug.Upload{} = upload}) do
    actor = conn.assigns[:current_user]

    unless actor do
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "authentication required"})
    else
      scope = %{user_id: actor.id}

      case AvatarUploader.store({upload, scope}) do
        {:ok, _file_name} ->
          # The thumb is always stored as avatars/:user_id/thumb.webp
          thumb_key = "avatars/#{actor.id}/thumb.webp"

          actor
          |> Ash.Changeset.for_update(:update_avatar, %{avatar_url: thumb_key}, actor: actor)
          |> Ash.update()
          |> case do
            {:ok, _user} ->
              json(conn, %{success: true, avatarUrl: thumb_key})

            {:error, error} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{success: false, error: inspect(error)})
          end

        {:error, reason} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{success: false, error: reason})
      end
    end
  end

  def upload_avatar(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "no file provided"})
  end
end
