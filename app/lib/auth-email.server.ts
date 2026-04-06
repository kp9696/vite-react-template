interface RegistrationOtpPayload {
  organizationName: string;
  adminName: string;
  email: string;
  department: string;
}

function hasMailConfig(env: Env): boolean {
  return Boolean(
    env.GMAIL_CLIENT_ID &&
      env.GMAIL_CLIENT_SECRET &&
      env.GMAIL_REFRESH_TOKEN,
  );
}

async function getGmailAccessToken(env: Env): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID ?? "",
      client_secret: env.GMAIL_CLIENT_SECRET ?? "",
      refresh_token: env.GMAIL_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

function toBase64Url(value: string): string {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildRawEmail(from: string, to: string, subject: string, html: string): string {
  const boundary = `bnd_${Date.now()}`;
  const message = [
    `From: JWithKP HRMS <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    "",
    html,
    `--${boundary}--`,
  ].join("\r\n");

  return toBase64Url(message);
}

function buildOtpHtml(payload: RegistrationOtpPayload, otpCode: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f5f9;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0d1117,#1a1f2e);padding:32px;text-align:center;">
      <span style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:800;font-size:18px;padding:10px 20px;border-radius:12px;">JWithKP HRMS</span>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 8px;font-size:24px;color:#111827;">Verify your account</h1>
      <p style="margin:0 0 20px;color:#6b7280;line-height:1.7;">Hi ${payload.adminName}, use this OTP to finish creating your ${payload.organizationName} workspace.</p>
      <div style="font-size:32px;letter-spacing:8px;font-weight:800;color:#4f46e5;background:#eef2ff;border:1px solid #c7d2fe;border-radius:16px;padding:18px;text-align:center;margin-bottom:20px;">${otpCode}</div>
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">This OTP expires in 10 minutes. If you did not request this, you can ignore this email.</p>
    </div>
  </div>
  </body></html>`;
}

export async function sendRegistrationOtpEmail(
  env: Env,
  payload: RegistrationOtpPayload,
  otpCode: string,
): Promise<void> {
  if (!hasMailConfig(env)) {
    throw new Error("Gmail OTP is not configured yet. Add Gmail OAuth secrets in Cloudflare Worker settings.");
  }

  const token = await getGmailAccessToken(env);
  const sender = env.GMAIL_FROM_EMAIL ?? "jjk.mratunjay@gmail.com";
  const raw = buildRawEmail(
    sender,
    payload.email,
    "Your JWithKP HRMS verification code",
    buildOtpHtml(payload, otpCode),
  );

  const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!gmailResponse.ok) {
    throw new Error(`Gmail API error: ${await gmailResponse.text()}`);
  }
}
