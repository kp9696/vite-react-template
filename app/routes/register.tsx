import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/register";
import { createSessionCookie } from "../lib/session.server";
import { registerOrganization } from "../lib/hrms.server";
import { isWorkEmail } from "../lib/hrms.shared";
import { createRegistrationOtp, verifyRegistrationOtp } from "../lib/registration-otp.server";
import { sendRegistrationOtpEmail } from "../lib/auth-email.server";

type ActionData = {
  error?: string;
  success?: string;
  step?: "request" | "verify";
  email?: string;
  organizationName?: string;
  adminName?: string;
  department?: string;
};

export function meta() {
  return [{ title: "JWithKP HRMS - Create Account" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return {
    email: url.searchParams.get("email") ?? "",
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const organizationName = String(formData.get("organizationName") || "").trim();
  const adminName = String(formData.get("adminName") || "").trim();
  const department = String(formData.get("department") || "Founders").trim();

  if (intent === "request-otp") {
    if (!email || !organizationName || !adminName) {
      return { error: "Organization name, admin name, and email are required." } satisfies ActionData;
    }

    if (!isWorkEmail(email)) {
      return { error: "Please register with a Gmail or company email address." } satisfies ActionData;
    }

    try {
      const payload = { organizationName, adminName, email, department };
      const otpCode = await createRegistrationOtp(context.cloudflare.env.HRMS, payload);
      await sendRegistrationOtpEmail(context.cloudflare.env, payload, otpCode);

      return {
        success: `OTP sent to ${email}. Enter it below to verify your account.`,
        step: "verify",
        email,
        organizationName,
        adminName,
        department,
      } satisfies ActionData;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to send OTP.",
        step: "request",
        email,
        organizationName,
        adminName,
        department,
      } satisfies ActionData;
    }
  }

  if (intent === "verify-otp") {
    const otpCode = String(formData.get("otpCode") || "").trim();
    if (!email || !otpCode) {
      return {
        error: "Email and OTP are required.",
        step: "verify",
        email,
        organizationName,
        adminName,
        department,
      } satisfies ActionData;
    }

    try {
      const payload = await verifyRegistrationOtp(context.cloudflare.env.HRMS, email, otpCode);
      await registerOrganization(context.cloudflare.env.HRMS, payload);

      return redirect("/hrms/users", {
        headers: {
          "Set-Cookie": createSessionCookie(email),
        },
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "OTP verification failed.",
        step: "verify",
        email,
        organizationName,
        adminName,
        department,
      } satisfies ActionData;
    }
  }

  return { error: "Unsupported registration action." } satisfies ActionData;
}

export default function Register({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const currentStep = actionData?.step ?? "request";

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f9", padding: "48px 20px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", background: "white", borderRadius: 24, padding: 32, boxShadow: "0 18px 48px rgba(15,17,23,0.08)" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#111827", marginBottom: 8 }}>Create account</div>
          <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7 }}>
            Register your workspace, receive an OTP on email, and verify before the admin account is created.
          </div>
        </div>

        <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 14, padding: 14, marginBottom: 20, color: "#3730a3", fontSize: 13, lineHeight: 1.7 }}>
          OTP verification is sent using Gmail. Sender email defaults to <strong>jjk.mratunjay@gmail.com</strong> when `GMAIL_FROM_EMAIL` is not set.
        </div>

        {currentStep === "request" ? (
          <Form method="post">
            <input type="hidden" name="intent" value="request-otp" />
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={labelStyle}>Organization Name</label>
                <input name="organizationName" defaultValue={actionData?.organizationName} placeholder="Acme Technologies" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Admin Name</label>
                <input name="adminName" defaultValue={actionData?.adminName} placeholder="Kiran Pandit" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input name="email" type="email" defaultValue={actionData?.email || loaderData.email} placeholder="admin@gmail.com or admin@company.com" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Department</label>
                <input name="department" defaultValue={actionData?.department || "Founders"} placeholder="Founders" style={fieldStyle} />
              </div>
            </div>

            {actionData?.error ? <div style={errorStyle}>{actionData.error}</div> : null}

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button type="submit" style={primaryButton} disabled={submitting}>
                {submitting ? "Sending OTP..." : "Send OTP"}
              </button>
              <a href="/login" style={secondaryButton}>Back to login</a>
            </div>
          </Form>
        ) : (
          <Form method="post">
            <input type="hidden" name="intent" value="verify-otp" />
            <input type="hidden" name="email" value={actionData?.email} />
            <input type="hidden" name="organizationName" value={actionData?.organizationName} />
            <input type="hidden" name="adminName" value={actionData?.adminName} />
            <input type="hidden" name="department" value={actionData?.department} />

            <div style={{ marginBottom: 16, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              {actionData?.success}
            </div>

            <div>
              <label style={labelStyle}>Enter OTP</label>
              <input name="otpCode" placeholder="6-digit OTP" style={fieldStyle} />
            </div>

            {actionData?.error ? <div style={errorStyle}>{actionData.error}</div> : null}

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button type="submit" style={primaryButton} disabled={submitting}>
                {submitting ? "Verifying..." : "Verify and Create Account"}
              </button>
            </div>
          </Form>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 };
const fieldStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #d1d5db", fontSize: 14, outline: "none" };
const primaryButton: React.CSSProperties = { border: "none", borderRadius: 12, padding: "12px 18px", background: "linear-gradient(135deg, #4f46e5, #7c3aed)", color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { borderRadius: 12, padding: "12px 18px", border: "1px solid #d1d5db", color: "#374151", textDecoration: "none", fontWeight: 600 };
const errorStyle: React.CSSProperties = { marginTop: 16, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 12, padding: 12, fontSize: 13 };
