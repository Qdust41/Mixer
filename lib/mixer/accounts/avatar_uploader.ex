defmodule Mixer.Accounts.AvatarUploader do
  use Waffle.Definition

  @versions [:original, :thumb]
  @extensions ~w(.jpg .jpeg .png .gif .webp)

  def validate({file, _scope}) do
    ext = file.file_name |> Path.extname() |> String.downcase()
    if ext in @extensions, do: :ok, else: {:error, "unsupported file type #{ext}"}
  end

  # Resize to a 256×256 square (centre-crop) and convert to WebP for efficiency
  def transform(:thumb, _) do
    {:convert, "-strip -thumbnail 256x256^ -gravity center -extent 256x256 -format webp", :webp}
  end

  # Store both versions under avatars/:user_id/
  def storage_dir(_version, {_file, scope}), do: "avatars/#{scope.user_id}"

  def filename(:original, {file, _scope}) do
    Path.basename(file.file_name, Path.extname(file.file_name))
  end

  def filename(:thumb, _), do: "thumb"

  def s3_object_headers(:thumb, _), do: [content_type: "image/webp"]

  def s3_object_headers(_version, {file, _scope}) do
    [content_type: MIME.from_path(file.file_name)]
  end

  def acl(_version, _), do: :public_read
end
