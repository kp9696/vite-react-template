import { createInviteToken } from "./invite-token.server";
import { markInviteSent } from "./hrms.server";

interface InviteEmailPayload {
  name: string;
  email: string;
  role: string;
  department: string;
}

function hasMailConfig(env: Env): boolean {
  if (env.RESEND_API_KEY) return true;
  return Boolean(
    env.GMAIL_CLIENT_ID &&
      env.GMAIL_CLIENT_SECRET &&
      env.GMAIL_REFRESH_TOKEN &&
      env.GMAIL_FROM_EMAIL,
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
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    html,
    `--${boundary}--`,
  ].join("\r\n");

  return toBase64Url(message);
}

function buildInviteHtml(
  name: string,
  email: string,
  role: string,
  department: string,
  inviteUrl: string,
): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f5f9;padding:40px 20px;">
<div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<div style="background:linear-gradient(135deg,#0d1117,#1a1f2e);padding:36px;text-align:center;">
  <span style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:800;font-size:18px;padding:10px 20px;border-radius:12px;">JWithKP HRMS</span>
</div>
<div style="padding:36px;">
  <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0d1117;">You're invited!</h1>
  <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi <strong style="color:#0d1117;">${name}</strong>, you've been added to JWithKP HRMS.</p>
  <div style="background:#f4f5f9;border-radius:10px;padding:16px;border-left:4px solid #6366f1;margin-bottom:28px;">
    <table width="100%"><tr>
      <td><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Role</div><div style="font-size:14px;font-weight:600;color:#0d1117;">${role}</div></td>
      <td><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Department</div><div style="font-size:14px;font-weight:600;color:#0d1117;">${department}</div></td>
    </tr><tr><td colspan="2" style="padding-top:12px;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Email</div>
      <div style="font-size:14px;color:#6366f1;">${email}</div>
    </td></tr></table>
  </div>
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;">Set Up My Account</a>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">Link expires in 7 days. Ignore if unexpected.</p>
</div>
<div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
  <p style="margin:0;font-size:12px;color:#9ca3af;">Copyright ${new Date().getFullYear()} JWithKP HRMS</p>
</div>
</div></body></html>`;
}

export async function sendInviteEmail(
  env: Env,
  db: D1Database,
  userId: string,
  payload: InviteEmailPayload,
  requestUrl: string,
): Promise<{ delivered: boolean; message: string }> {
  if (!hasMailConfig(env)) {
    return {
      delivered: false,
      message: "User saved, but email is not configured yet. The user record is still saved in D1.",
    };
  }

  const inviteToken = await createInviteToken(db, userId, payload.email);
  const url = new URL(requestUrl);
  const baseUrl = env.HRMS_BASE_URL || `${url.protocol}//${url.host}`;
  const inviteUrl = `${baseUrl}/login?invite=${encodeURIComponent(inviteToken)}`;
  const html = buildInviteHtml(
    payload.name,
    payload.email,
    payload.role,
    payload.department,
    inviteUrl,
  );
  const subject = "You're invited to JWithKP HRMS";

  // ── Resend (primary) ────────────────────────────────────────────────────────
  if (env.RESEND_API_KEY) {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MS_FROM_EMAIL ?? "info@jwithkp.com",
        to: [payload.email],
        subject,
        html,
      }),
    });

    if (!resendResponse.ok) {
      throw new Error(`Resend error: ${await resendResponse.text()}`);
    }

    await markInviteSent(db, userId);
    return { delivered: true, message: `Invite sent to ${payload.email}.` };
  }

  // ── Gmail OAuth (fallback) ──────────────────────────────────────────────────
  const token = await getGmailAccessToken(env);
  const raw = buildRawEmail(
    env.GMAIL_FROM_EMAIL ?? "",
    payload.email,
    subject,
    html,
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

  await markInviteSent(db, userId);
  return { delivered: true, message: `Invite sent to ${payload.email}.` };
}
