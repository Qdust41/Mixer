defmodule Mixer.Posts.MediaUploader do
  use Waffle.Definition

  @async false
  @versions [:original]
  @extensions ~w(.jpg .jpeg .png .gif .webp .mp4 .mov)

  def validate({file, _scope}) do
    ext = file.file_name |> Path.extname() |> String.downcase()
    if ext in @extensions, do: :ok, else: {:error, "unsupported file type #{ext}"}
  end

  def storage_dir(_version, {_file, scope}), do: "uploads/media/#{scope.user_id}/#{scope.media_id}"

  def filename(_version, {file, _scope}) do
    Path.basename(file.file_name, Path.extname(file.file_name))
  end

  def s3_object_headers(_version, {file, _scope}) do
    [content_type: MIME.from_path(file.file_name)]
  end

  def acl(_version, _), do: :public_read
end
