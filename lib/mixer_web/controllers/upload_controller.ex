defmodule MixerWeb.UploadController do
  use MixerWeb, :controller

  alias Mixer.Posts.MediaUploader

  def create(conn, %{"file" => %Plug.Upload{} = upload}) do
    actor = conn.assigns[:current_user]

    unless actor do
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "authentication required"})
    else
      scope = %{id: Ash.UUID.generate()}

      case MediaUploader.store({upload, scope}) do
        {:ok, file_name} ->
          s3_key = "uploads/media/#{scope.id}/#{file_name}"
          url = MediaUploader.url({file_name, scope})

          Mixer.Posts.Media
          |> Ash.Changeset.for_create(:upload, %{s3_key: s3_key}, actor: actor)
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
end
