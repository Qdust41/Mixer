defmodule Mixer.Accounts.User.Senders.SendMagicLinkEmail do
  @moduledoc """
  Sends a magic link email
  """

  use AshAuthentication.Sender
  use MixerWeb, :verified_routes

  import Swoosh.Email
  alias Mixer.Mailer

  @impl true
  def send(user_or_email, token, _) do
    # if you get a user, its for a user that already exists.
    # if you get an email, then the user does not yet exist.

    email =
      case user_or_email do
        %{email: email} -> email
        email -> email
      end

    new()
    |> from({"noreply", "noreply@jimweaver.com"})
    |> to(to_string(email))
    |> subject("Your login link")
    |> html_body(body(token: token, email: email))
    |> Mailer.deliver!()
  end

  defp body(params) do
    # NOTE: You may have to change this to match your magic link acceptance URL.
    link = url(~p"/magic_link/#{params[:token]}")
    email_template("Your magic link", "Hello, #{params[:email]}!", """
      <p style="margin:0 0 20px 0;color:#4B5563;font-size:16px;line-height:1.6;">
        Use the button below to sign in to Mixer. This link is valid for a short time and can only be used once.
      </p>
      <p style="margin:0 0 32px 0;color:#4B5563;font-size:16px;line-height:1.6;">
        If you didn't request this, you can safely ignore this email.
      </p>
    """, link, "Sign In to Mixer")
  end

  defp email_template(title, greeting, content, button_url, button_label) do
    """
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>#{title}</title>
    </head>
    <body style="margin:0;padding:0;background-color:#09090f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#09090f;padding:48px 16px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

              <!-- Header -->
              <tr>
                <td style="background-color:#0e0e18;border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;border:1px solid #1e1e30;border-bottom:none;">
                  <div style="font-size:28px;font-style:italic;font-weight:400;color:#e8e8f0;letter-spacing:-0.02em;font-family:Georgia,'Times New Roman',serif;">Mixer</div>
                  <div style="font-size:11px;color:#4a4a6a;margin-top:6px;letter-spacing:0.1em;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Your social feed</div>
                </td>
              </tr>

              <!-- Accent bar -->
              <tr>
                <td style="background-color:#7c3aed;height:2px;font-size:0;line-height:0;border-left:1px solid #1e1e30;border-right:1px solid #1e1e30;">&nbsp;</td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="background-color:#111120;padding:40px 40px 32px 40px;border:1px solid #1e1e30;border-top:none;border-bottom:none;">
                  <h1 style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:#e8e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">#{greeting}</h1>
                  #{content}
                  <!-- CTA Button -->
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="border-radius:8px;background-color:#7c3aed;">
                        <a href="#{button_url}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;letter-spacing:0.01em;border-radius:8px;">#{button_label}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color:#0e0e18;border-radius:0 0 12px 12px;padding:24px 40px;border:1px solid #1e1e30;border-top:1px solid #1e1e30;">
                  <p style="margin:0 0 8px 0;font-size:12px;color:#4a4a6a;line-height:1.6;font-family:'Courier New',Courier,monospace;letter-spacing:0.02em;">
                    This is an automated message — replies to this address are not monitored.
                  </p>
                  <p style="margin:0;font-size:12px;color:#35354a;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
                    You received this because you have an account on Mixer.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """
  end
end
