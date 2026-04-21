/**
 * Shared transactional email utility for Cloudflare Workers.
 * Provider priority: Resend → Microsoft 365 Graph API → Gmail OAuth
 */

function hasMailConfig(env: Env): boolean {
  if (env.RESEND_API_KEY) return true;
  if (env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET) return true;
  return Boolean(
    env.GMAIL_CLIENT_ID &&
      env.GMAIL_CLIENT_SECRET &&
      env.GMAIL_REFRESH_TOKEN &&
      env.GMAIL_FROM_EMAIL,
  );
}

// ── Microsoft 365 Graph API ───────────────────────────────────────────────────

async function getMicrosoftGraphToken(env: Env): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.MS_CLIENT_ID ?? "",
      client_secret: env.MS_CLIENT_SECRET ?? "",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!response.ok) throw new Error(`M365 token fetch failed: ${await response.text()}`);
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

async function sendViaM365(env: Env, from: string, opts: { to: string; subject: string; html: string }): Promise<void> {
  const token = await getMicrosoftGraphToken(env);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${from}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: opts.subject,
        body: { contentType: "HTML", content: opts.html },
        toRecipients: [{ emailAddress: { address: opts.to } }],
      },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) console.error(`[email] M365 error: ${await res.text()}`);
}

// ── Gmail OAuth ───────────────────────────────────────────────────────────────

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
  if (!response.ok) throw new Error(`Gmail token refresh failed: ${await response.text()}`);
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

// ── Main send function ────────────────────────────────────────────────────────

/** Send a transactional email. Tries each configured provider in order, falling through on failure. */
export async function sendEmail(
  env: Env,
  opts: { to: string; subject: string; html: string },
): Promise<void> {
  if (!hasMailConfig(env)) return; // no mail config — skip silently

  // Each provider uses its own correct "from" address:
  // - Resend / Gmail OAuth: any verified address
  // - M365 Graph API: MUST be a mailbox that exists in the M365 tenant
  const resendFrom = env.MS_FROM_EMAIL ?? env.GMAIL_FROM_EMAIL ?? "info@jwithkp.com";
  const m365From   = env.MS_FROM_EMAIL ?? "info@jwithkp.com"; // M365 tenant mailbox only
  const gmailFrom  = env.GMAIL_FROM_EMAIL ?? env.MS_FROM_EMAIL ?? "info@jwithkp.com";

  // 1. Resend (fastest, best deliverability) — falls through if domain not verified or API error
  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: resendFrom, to: [opts.to], subject: opts.subject, html: opts.html }),
      });
      if (res.ok) return; // success — stop here
      const errText = await res.text();
      console.warn(`[email] Resend failed (${res.status}), trying next provider: ${errText}`);
    } catch (e) {
      console.warn(`[email] Resend threw, trying next provider:`, e);
    }
  }

  // 2. Microsoft 365 Graph API — uses the M365 mailbox as sender (same as OTP emails in app.ts)
  if (env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET) {
    try {
      await sendViaM365(env, m365From, opts);
      return;
    } catch (e) {
      console.warn(`[email] M365 threw, trying next provider:`, e);
    }
  }

  // 3. Gmail OAuth fallback
  if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN) {
    try {
      const token = await getGmailAccessToken(env);
      const raw = buildRawEmail(gmailFrom, opts.to, opts.subject, opts.html);
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) console.error(`[email] Gmail error: ${await res.text()}`);
    } catch (e) {
      console.error(`[email] Gmail threw:`, e);
    }
  }
}

// ── Email HTML builders ───────────────────────────────────────────────────────

const BRAND_HEADER = `
<div style="background:linear-gradient(135deg,#0d1117,#1a1f2e);padding:28px 36px;text-align:center;">
  <span style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:800;font-size:16px;padding:8px 18px;border-radius:10px;letter-spacing:-0.3px;">JWithKP HRMS</span>
</div>`;

const BRAND_FOOTER = `
<div style="background:#f9fafb;padding:14px;text-align:center;border-top:1px solid #e5e7eb;">
  <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} JWithKP HRMS · This is an automated message, please do not reply.</p>
</div>`;

function card(content: string): string {
  return `<!DOCTYPE html><html><body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f5f9;padding:40px 20px;margin:0;">
<div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
${BRAND_HEADER}
<div style="padding:32px 36px;">
${content}
</div>
${BRAND_FOOTER}
</div></body></html>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;width:130px;">${label}</td>
    <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:500;">${value}</td>
  </tr>`;
}

function ctaButton(text: string, href: string, color = "#6366f1"): string {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${href}" style="display:inline-block;background:${color};color:white;text-decoration:none;font-size:14px;font-weight:700;padding:13px 32px;border-radius:10px;">${text}</a>
  </div>`;
}

// ── Leave decision email ──────────────────────────────────────────────────────

export function buildLeaveDecisionHtml(opts: {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: "approved" | "rejected";
  note?: string;
  baseUrl: string;
}): string {
  const approved = opts.status === "approved";
  const color = approved ? "#10b981" : "#ef4444";
  const bgColor = approved ? "#ecfdf5" : "#fef2f2";
  const emoji = approved ? "✅" : "❌";
  const verb = approved ? "Approved" : "Rejected";

  const content = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#111827;">${emoji} Leave ${verb}</h1>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">Hi <strong style="color:#111827;">${opts.employeeName}</strong>, your leave request has been <strong style="color:${color};">${verb.toLowerCase()}</strong>.</p>

    <div style="background:${bgColor};border-radius:10px;padding:16px;border-left:4px solid ${color};margin-bottom:${opts.note ? "20px" : "28px"};">
      <table width="100%" style="border-collapse:collapse;">
        ${infoRow("Leave Type", opts.leaveType)}
        ${infoRow("From", opts.startDate)}
        ${infoRow("To", opts.endDate)}
        ${infoRow("Duration", `${opts.totalDays} day${opts.totalDays !== 1 ? "s" : ""}`)}
        ${infoRow("Status", `<span style="color:${color};font-weight:700;">${verb}</span>`)}
      </table>
    </div>

    ${opts.note ? `<div style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-bottom:24px;border:1px solid #e5e7eb;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Reviewer's Note</div>
      <div style="font-size:13px;color:#374151;">${opts.note}</div>
    </div>` : ""}

    ${ctaButton("View Leave Dashboard", `${opts.baseUrl}/hrms/leave`, color)}`;

  return card(content);
}

// ── Expense decision email ────────────────────────────────────────────────────

export function buildExpenseDecisionHtml(opts: {
  employeeName: string;
  category: string;
  description: string;
  amount: number;
  status: "approved" | "rejected" | "reimbursed";
  notes?: string;
  baseUrl: string;
}): string {
  const colorMap: Record<string, string> = {
    approved: "#10b981",
    rejected: "#ef4444",
    reimbursed: "#6366f1",
  };
  const bgMap: Record<string, string> = {
    approved: "#ecfdf5",
    rejected: "#fef2f2",
    reimbursed: "#eef2ff",
  };
  const emojiMap: Record<string, string> = {
    approved: "✅",
    rejected: "❌",
    reimbursed: "💰",
  };
  const verbMap: Record<string, string> = {
    approved: "Approved",
    rejected: "Rejected",
    reimbursed: "Reimbursed",
  };

  const color = colorMap[opts.status] ?? "#6366f1";
  const bgColor = bgMap[opts.status] ?? "#eef2ff";
  const emoji = emojiMap[opts.status] ?? "📄";
  const verb = verbMap[opts.status] ?? opts.status;

  const content = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#111827;">${emoji} Expense ${verb}</h1>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">Hi <strong style="color:#111827;">${opts.employeeName}</strong>, your expense claim has been <strong style="color:${color};">${verb.toLowerCase()}</strong>.</p>

    <div style="background:${bgColor};border-radius:10px;padding:16px;border-left:4px solid ${color};margin-bottom:${opts.notes ? "20px" : "28px"};">
      <table width="100%" style="border-collapse:collapse;">
        ${infoRow("Category", opts.category)}
        ${infoRow("Description", opts.description)}
        ${infoRow("Amount", `₹${opts.amount.toLocaleString("en-IN")}`)}
        ${infoRow("Status", `<span style="color:${color};font-weight:700;">${verb}</span>`)}
      </table>
    </div>

    ${opts.notes ? `<div style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-bottom:24px;border:1px solid #e5e7eb;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Reviewer's Note</div>
      <div style="font-size:13px;color:#374151;">${opts.notes}</div>
    </div>` : ""}

    ${ctaButton("View Expenses", `${opts.baseUrl}/hrms/expenses`, color)}`;

  return card(content);
}

// ── Payslip email ─────────────────────────────────────────────────────────────

export function buildPayslipEmailHtml(opts: {
  employeeName: string;
  month: string;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  baseUrl: string;
}): string {
  const content = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#111827;">💰 Your Payslip is Ready</h1>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">Hi <strong style="color:#111827;">${opts.employeeName}</strong>, your salary for <strong style="color:#111827;">${opts.month}</strong> has been processed.</p>

    <div style="background:#eef2ff;border-radius:10px;padding:16px;border-left:4px solid #6366f1;margin-bottom:28px;">
      <table width="100%" style="border-collapse:collapse;">
        ${infoRow("Pay Period", opts.month)}
        ${infoRow("Gross Pay", `₹${opts.grossPay.toLocaleString("en-IN")}`)}
        ${infoRow("Total Deductions", `- ₹${opts.totalDeductions.toLocaleString("en-IN")}`)}
        ${infoRow("Net Pay", `<span style="color:#6366f1;font-weight:800;font-size:16px;">₹${opts.netPay.toLocaleString("en-IN")}</span>`)}
      </table>
    </div>

    <p style="color:#6b7280;font-size:13px;text-align:center;margin:0 0 4px;">Log in to download your detailed payslip PDF.</p>
    ${ctaButton("View & Download Payslip", `${opts.baseUrl}/hrms/payroll`)}`;

  return card(content);
}
