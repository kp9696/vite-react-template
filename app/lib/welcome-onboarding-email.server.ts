function buildWelcomeHtml(name: string, role: string, department: string, startDate: string): string {
  const formatted = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(startDate));
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f5f9;padding:40px 20px;">
<div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<div style="background:linear-gradient(135deg,#0d1117,#1a1f2e);padding:36px;text-align:center;">
  <span style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:800;font-size:18px;padding:10px 20px;border-radius:12px;">JWithKP HRMS</span>
</div>
<div style="padding:36px;">
  <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0d1117;">Welcome aboard, ${name}! 🎉</h1>
  <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 24px;">We're thrilled to have you join us. Here's a quick summary of your onboarding details.</p>
  <div style="background:#f4f5f9;border-radius:10px;padding:16px;border-left:4px solid #6366f1;margin-bottom:28px;">
    <table width="100%">
      <tr>
        <td style="padding-bottom:12px;"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Role</div><div style="font-size:14px;font-weight:600;color:#0d1117;">${role}</div></td>
        <td style="padding-bottom:12px;"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Department</div><div style="font-size:14px;font-weight:600;color:#0d1117;">${department}</div></td>
      </tr>
      <tr>
        <td colspan="2"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Start Date</div><div style="font-size:14px;font-weight:600;color:#6366f1;">${formatted}</div></td>
      </tr>
    </table>
  </div>
  <div style="background:#eff6ff;border-radius:10px;padding:16px;margin-bottom:28px;">
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1e40af;">What to expect on Day 1</p>
    <ul style="margin:0;padding-left:18px;color:#3b82f6;font-size:13px;line-height:1.8;">
      <li>Laptop &amp; access card will be ready at the reception</li>
      <li>HR induction session at 10:00 AM</li>
      <li>Team introduction &amp; buddy meet</li>
      <li>Tool access (email, Slack, Jira) provisioned by EOD</li>
    </ul>
  </div>
  <p style="font-size:13px;color:#6b7280;margin:0;">If you have any questions before your start date, reply to this email and our HR team will get back to you shortly.</p>
</div>
<div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
  <p style="margin:0;font-size:12px;color:#9ca3af;">Copyright ${new Date().getFullYear()} JWithKP HRMS · Welcome to the team!</p>
</div>
</div></body></html>`;
}

export async function sendOnboardingWelcomeEmail(
  env: Env,
  joiner: { name: string; email: string; role: string; department: string; startDate: string },
): Promise<{ delivered: boolean; message: string }> {
  if (!joiner.email) {
    return { delivered: false, message: "No email address on record for this joiner." };
  }

  const subject = `Welcome to JWithKP HRMS, ${joiner.name}!`;
  const html = buildWelcomeHtml(joiner.name, joiner.role, joiner.department, joiner.startDate);

  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MS_FROM_EMAIL ?? "info@jwithkp.com",
        to: [joiner.email],
        subject,
        html,
      }),
    });
    if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
    return { delivered: true, message: `Welcome email sent to ${joiner.email}.` };
  }

  return { delivered: false, message: "Email provider not configured." };
}
