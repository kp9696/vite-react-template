import { createRequestHandler } from "react-router";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

// Gmail OAuth2 helper
async function getGmailAccessToken(env: Env): Promise<string> {
	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: (env as any).GMAIL_CLIENT_ID || "",
			client_secret: (env as any).GMAIL_CLIENT_SECRET || "",
			refresh_token: (env as any).GMAIL_REFRESH_TOKEN || "",
			grant_type: "refresh_token",
		}),
	});
	if (!res.ok) throw new Error("Token refresh failed");
	const data = await res.json() as { access_token: string };
	return data.access_token;
}

function buildRawEmail(from: string, to: string, subject: string, html: string): string {
	const boundary = "bnd_" + Date.now();
	const msg = [
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
	return btoa(unescape(encodeURIComponent(msg))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

function buildInviteHtml(name: string, email: string, role: string, dept: string, url: string): string {
	return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f4f5f9;padding:40px 20px;">
<div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<div style="background:linear-gradient(135deg,#0d1117,#1a1f2e);padding:36px;text-align:center;">
  <span style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:800;font-size:18px;padding:10px 20px;border-radius:12px;letter-spacing:-0.5px;">JWithKP HRMS</span>
</div>
<div style="padding:36px;">
  <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0d1117;">You're invited! 🎉</h1>
  <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi <strong style="color:#0d1117;">${name}</strong>, you've been added to JWithKP HRMS.</p>
  <div style="background:#f4f5f9;border-radius:10px;padding:16px;border-left:4px solid #6366f1;margin-bottom:28px;">
    <table width="100%"><tr>
      <td><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Role</div><div style="font-size:14px;font-weight:600;color:#0d1117;">${role}</div></td>
      <td><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Department</div><div style="font-size:14px;font-weight:600;color:#0d1117;">${dept}</div></td>
    </tr><tr><td colspan="2" style="padding-top:12px;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Email</div>
      <div style="font-size:14px;color:#6366f1;">${email}</div>
    </td></tr></table>
  </div>
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;box-shadow:0 4px 14px rgba(99,102,241,0.4);">Set Up My Account →</a>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">Link expires in 7 days. Ignore if unexpected.</p>
</div>
<div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
  <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} JWithKP HRMS</p>
</div>
</div></body></html>`;
}

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Handle preflight
		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}

		// API: Send invite email
		if (url.pathname === "/api/send-invite" && request.method === "POST") {
			try {
				const { name, email, role, dept } = await request.json() as any;

				if (!name || !email) {
					return Response.json({ success: false, error: "Name and email are required" }, { status: 400, headers: corsHeaders });
				}

				const gmailFrom = (env as any).GMAIL_FROM_EMAIL;
				const clientId = (env as any).GMAIL_CLIENT_ID;

				if (!clientId || !gmailFrom) {
					return Response.json({
						success: false,
						error: "Gmail not configured. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM_EMAIL to Cloudflare Workers env vars."
					}, { status: 500, headers: corsHeaders });
				}

				const token = await getGmailAccessToken(env);
				const baseUrl = (env as any).HRMS_BASE_URL || `https://${url.hostname}`;
				const inviteToken = btoa(JSON.stringify({ email, exp: Date.now() + 7 * 24 * 3600 * 1000 })).replace(/=/g, "");
				const inviteUrl = `${baseUrl}/login?invite=${inviteToken}`;

				const html = buildInviteHtml(name, email, role || "Employee", dept || "General", inviteUrl);
				const raw = buildRawEmail(gmailFrom, email, "You're invited to JWithKP HRMS 🎉", html);

				const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
					method: "POST",
					headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
					body: JSON.stringify({ raw }),
				});

				if (!gmailRes.ok) {
					const err = await gmailRes.text();
					return Response.json({ success: false, error: `Gmail error: ${err}` }, { status: 500, headers: corsHeaders });
				}

				return Response.json({ success: true }, { headers: corsHeaders });

			} catch (err) {
				return Response.json({ success: false, error: String(err) }, { status: 500, headers: corsHeaders });
			}
		}

		// All other requests → React Router app
		return requestHandler(request, {
			cloudflare: { env, ctx },
		});
	},
} satisfies ExportedHandler<Env>;
