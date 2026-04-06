// workers/send-invite.ts
// Cloudflare Worker that sends invitation emails via Gmail API (OAuth2)
// Environment variables needed (set in Cloudflare Dashboard > Workers > Settings > Variables):
//   GMAIL_CLIENT_ID       - OAuth2 Client ID from Google Cloud Console
//   GMAIL_CLIENT_SECRET   - OAuth2 Client Secret
//   GMAIL_REFRESH_TOKEN   - Long-lived refresh token
//   GMAIL_FROM_EMAIL      - The Gmail address to send from (must match the OAuth account)
//   HRMS_BASE_URL         - Your app URL e.g. https://vite-react-template.keshavpandit9696.workers.dev

interface Env {
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
  GMAIL_FROM_EMAIL: string;
  HRMS_BASE_URL: string;
}

interface InvitePayload {
  name: string;
  email: string;
  role: string;
  dept: string;
}

// Get a fresh Gmail access token using the refresh token
async function getAccessToken(env: Env): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get access token: ${err}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// Build the RFC 2822 email and encode it as base64url for Gmail API
function buildEmail(from: string, to: string, subject: string, htmlBody: string): string {
  const boundary = "boundary_jwithkp_" + Date.now();
  const raw = [
    `From: JWithKP HRMS <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    htmlBody,
    `--${boundary}--`,
  ].join("\r\n");

  // Base64url encode
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Generate a secure invite token (simple for demo - use proper JWT in production)
function generateInviteToken(email: string): string {
  const payload = btoa(JSON.stringify({ email, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }));
  return payload.replace(/=/g, "");
}

// Beautiful HTML email template
function buildInviteEmail(name: string, email: string, role: string, dept: string, inviteUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to JWithKP HRMS</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0d1117,#1a1f2e);padding:40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:12px;">
                <div style="width:48px;height:48px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:14px;display:inline-block;text-align:center;line-height:48px;font-weight:800;font-size:16px;color:white;letter-spacing:-1px;">JK</div>
                <div style="text-align:left;display:inline-block;vertical-align:middle;margin-left:8px;">
                  <div style="font-size:20px;font-weight:800;color:white;letter-spacing:-0.5px;">JWithKP</div>
                  <div style="font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:1px;text-transform:uppercase;">HRMS Platform</div>
                </div>
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#0d1117;letter-spacing:-0.5px;">You're invited! 🎉</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Hi <strong style="color:#0d1117;">${name}</strong>, your HR Admin has added you to <strong style="color:#0d1117;">JWithKP HRMS</strong>.
              </p>

              <!-- Role Card -->
              <div style="background:#f4f5f9;border-radius:12px;padding:20px;margin-bottom:28px;border-left:4px solid #6366f1;">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td width="50%">
                      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Role</div>
                      <div style="font-size:14px;font-weight:600;color:#0d1117;">${role}</div>
                    </td>
                    <td width="50%">
                      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Department</div>
                      <div style="font-size:14px;font-weight:600;color:#0d1117;">${dept}</div>
                    </td>
                  </tr>
                  <tr><td colspan="2" style="padding-top:12px;">
                    <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Email</div>
                    <div style="font-size:14px;color:#6366f1;">${email}</div>
                  </td></tr>
                </table>
              </div>

              <!-- CTA Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;letter-spacing:-0.2px;box-shadow:0 4px 14px rgba(99,102,241,0.4);">
                  Set Up My Account →
                </a>
              </div>

              <p style="margin:0 0 16px;font-size:13px;color:#9ca3af;text-align:center;">
                This invite link expires in <strong>7 days</strong>. If you didn't expect this, you can ignore this email.
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

              <!-- Features -->
              <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#374151;">What you can do with JWithKP HRMS:</p>
              <table cellpadding="0" cellspacing="0" width="100%">
                ${[
                  ["🗓️", "Apply & track leaves instantly"],
                  ["💰", "View your payslips & salary breakdown"],
                  ["📊", "Track your performance & OKRs"],
                  ["🤖", "Ask HRBot any HR policy question"],
                ].map(([icon, text]) => `
                <tr>
                  <td style="padding:6px 0;">
                    <table cellpadding="0" cellspacing="0"><tr>
                      <td style="width:28px;font-size:16px;">${icon}</td>
                      <td style="font-size:13px;color:#6b7280;">${text}</td>
                    </tr></table>
                  </td>
                </tr>`).join("")}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                © ${new Date().getFullYear()} JWithKP HRMS · Sent by your HR Admin<br>
                <a href="${inviteUrl}" style="color:#6366f1;">Accept Invite</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname !== "/api/send-invite" || request.method !== "POST") {
      return new Response("Not Found", { status: 404 });
    }

    try {
      const body = await request.json() as InvitePayload;
      const { name, email, role, dept } = body;

      if (!name || !email || !role || !dept) {
        return Response.json({ success: false, error: "Missing required fields" }, { status: 400, headers: corsHeaders });
      }

      // Check env vars are configured
      if (!env.GMAIL_CLIENT_ID || !env.GMAIL_REFRESH_TOKEN) {
        return Response.json({
          success: false,
          error: "Gmail not configured. Please set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM_EMAIL in Cloudflare Workers environment variables."
        }, { status: 500, headers: corsHeaders });
      }

      // Get fresh access token
      const accessToken = await getAccessToken(env);

      // Generate invite URL
      const token = generateInviteToken(email);
      const baseUrl = env.HRMS_BASE_URL || "https://vite-react-template.keshavpandit9696.workers.dev";
      const inviteUrl = `${baseUrl}/login?invite=${token}`;

      // Build email
      const subject = `You're invited to JWithKP HRMS 🎉`;
      const htmlBody = buildInviteEmail(name, email, role, dept, inviteUrl);
      const rawEmail = buildEmail(env.GMAIL_FROM_EMAIL, email, subject, htmlBody);

      // Send via Gmail API
      const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: rawEmail }),
      });

      if (!gmailRes.ok) {
        const err = await gmailRes.text();
        console.error("Gmail API error:", err);
        return Response.json({ success: false, error: "Failed to send email via Gmail" }, { status: 500, headers: corsHeaders });
      }

      return Response.json({ success: true, message: `Invite sent to ${email}` }, { headers: corsHeaders });

    } catch (err) {
      console.error("Send invite error:", err);
      return Response.json({ success: false, error: String(err) }, { status: 500, headers: corsHeaders });
    }
  },
};
