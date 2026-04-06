import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/register";
import { createSessionCookie } from "../lib/session.server";
import { registerOrganization } from "../lib/hrms.server";
import { isWorkEmail } from "../lib/hrms.shared";

type ActionData = {
  error?: string;
};

export function meta() {
  return [{ title: "JWithKP HRMS - Register" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return {
    email: url.searchParams.get("email") ?? "",
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const organizationName = String(formData.get("organizationName") || "").trim();
  const adminName = String(formData.get("adminName") || "").trim();
  const department = String(formData.get("department") || "Founders").trim();

  if (!email || !organizationName || !adminName) {
    return { error: "Organization name, admin name, and work email are required." } satisfies ActionData;
  }

  if (!isWorkEmail(email)) {
    return { error: "Please register with your company email address." } satisfies ActionData;
  }

  try {
    await registerOrganization(context.cloudflare.env.HRMS, {
      organizationName,
      adminName,
      email,
      department,
    });

    return redirect("/hrms/users", {
      headers: {
        "Set-Cookie": createSessionCookie(email),
      },
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Registration failed.",
    } satisfies ActionData;
  }
}

export default function Register({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f9", padding: "48px 20px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", background: "white", borderRadius: 24, padding: 32, boxShadow: "0 18px 48px rgba(15,17,23,0.08)" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#111827", marginBottom: 8 }}>Register your company</div>
          <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7 }}>
            Register with your work email and we will create an admin workspace with capacity to invite up to 10 team members.
          </div>
        </div>

        <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 14, padding: 14, marginBottom: 20, color: "#3730a3", fontSize: 13, lineHeight: 1.7 }}>
          Existing company admins can invite up to 5 team members. New company registration starts with a 10-user invite capacity.
        </div>

        <Form method="post">
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Organization Name</label>
              <input name="organizationName" placeholder="Acme Technologies" style={fieldStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Admin Name</label>
              <input name="adminName" placeholder="Kiran Pandit" style={fieldStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Work Email</label>
              <input name="email" type="email" defaultValue={loaderData.email} placeholder="admin@company.com" style={fieldStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Department</label>
              <input name="department" defaultValue="Founders" placeholder="Founders" style={fieldStyle} />
            </div>
          </div>

          {actionData?.error && (
            <div style={{ marginTop: 16, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 12, padding: 12, fontSize: 13 }}>
              {actionData.error}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button type="submit" style={primaryButton} disabled={submitting}>
              {submitting ? "Creating workspace..." : "Create Admin Workspace"}
            </button>
            <a href="/login" style={secondaryButton}>Back to login</a>
          </div>
        </Form>
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
};

const primaryButton: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "12px 18px",
  background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  borderRadius: 12,
  padding: "12px 18px",
  border: "1px solid #d1d5db",
  color: "#374151",
  textDecoration: "none",
  fontWeight: 600,
};
