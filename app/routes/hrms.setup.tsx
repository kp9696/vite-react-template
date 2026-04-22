import { useState } from "react";
import { useFetcher, useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/hrms.setup";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { n: 1 as Step, label: "Company Profile", icon: "🏢" },
  { n: 2 as Step, label: "Departments",     icon: "🏗️" },
  { n: 3 as Step, label: "Invite Team",     icon: "👥" },
  { n: 4 as Step, label: "Complete",        icon: "🎉" },
];

export function meta() {
  return [{ title: "JWithKP HRMS - Setup Wizard" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  if (!isAdminRole(currentUser.role)) throw redirect("/hrms");

  const [settingsRes, deptsRes] = await Promise.all([
    callCoreHrmsApi<{ settings: { setupCompleted: boolean; timezone: string; currency: string; dateFormat: string; payrollDay: number } }>({
      request, env: context.cloudflare.env, currentUser, path: "/api/tenant/settings",
    }),
    callCoreHrmsApi<{ departments: { id: string; name: string }[] }>({
      request, env: context.cloudflare.env, currentUser, path: "/api/departments",
    }),
  ]);

  return {
    currentUser,
    settings: settingsRes?.settings,
    departments: deptsRes?.departments ?? [],
    alreadyCompleted: settingsRes?.settings?.setupCompleted ?? false,
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "save-profile") {
    await callCoreHrmsApi({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/tenant/settings", method: "POST",
      body: {
        timezone: String(formData.get("timezone") || "Asia/Kolkata"),
        currency: String(formData.get("currency") || "INR"),
        dateFormat: String(formData.get("dateFormat") || "DD/MM/YYYY"),
        payrollDay: Number(formData.get("payrollDay") || 1),
        wfhEnabled: formData.get("wfhEnabled") === "true",
      },
    });
    return { ok: true, intent };
  }

  if (intent === "add-dept") {
    await callCoreHrmsApi({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/departments", method: "POST",
      body: { name: String(formData.get("name") || "").trim() },
    });
    return { ok: true, intent };
  }

  if (intent === "complete-setup") {
    await callCoreHrmsApi({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/tenant/settings", method: "POST",
      body: { setupCompleted: true },
    });
    throw redirect("/hrms");
  }

  return { ok: false, intent };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SetupWizard() {
  const { currentUser, settings, departments, alreadyCompleted } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; intent: string }>();

  const [step, setStep] = useState<Step>(1);
  const [deptInput, setDeptInput] = useState("");

  // Profile form state
  const [timezone, setTimezone] = useState(settings?.timezone ?? "Asia/Kolkata");
  const [currency, setCurrency] = useState(settings?.currency ?? "INR");
  const [dateFormat, setDateFormat] = useState(settings?.dateFormat ?? "DD/MM/YYYY");
  const [payrollDay, setPayrollDay] = useState(settings?.payrollDay ?? 1);
  const [wfhEnabled, setWfhEnabled] = useState(true);

  const submitting = fetcher.state !== "idle";

  const stepsDone = {
    1: true,
    2: departments.length > 0,
    3: true,
    4: alreadyCompleted,
  };

  return (
    <HRMSLayout currentUser={currentUser}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 20px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🚀</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: "0 0 8px" }}>
            Welcome to JWithKP HRMS
          </h1>
          <p style={{ color: "#6b7280", fontSize: 15 }}>
            Let's get your company set up in a few quick steps.
          </p>
        </div>

        {/* Step progress */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 36, gap: 0 }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
              <div
                onClick={() => s.n < step || stepsDone[s.n] ? setStep(s.n) : undefined}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  cursor: s.n <= step ? "pointer" : "default",
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                  background: step === s.n ? "#4f46e5" : stepsDone[s.n] ? "#d1fae5" : "#f3f4f6",
                  border: step === s.n ? "2px solid #4f46e5" : "2px solid transparent",
                  transition: "all 0.2s",
                }}>
                  {step > s.n ? "✓" : s.icon}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: step === s.n ? 700 : 500,
                  color: step === s.n ? "#4f46e5" : "#6b7280", whiteSpace: "nowrap",
                }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  width: 60, height: 2, margin: "-14px 4px 0",
                  background: step > s.n ? "#4f46e5" : "#e5e7eb",
                  transition: "background 0.3s",
                }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Step 1: Company Profile ── */}
        {step === 1 && (
          <WizardCard title="Company Profile" subtitle="Configure your timezone, currency, and payroll settings.">
            <fetcher.Form method="post" onSubmit={() => { if (step === 1) setTimeout(() => setStep(2), 400); }}>
              <input type="hidden" name="intent" value="save-profile" />
              <input type="hidden" name="wfhEnabled" value={String(wfhEnabled)} />
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Field label="Timezone">
                  <select name="timezone" value={timezone} onChange={e => setTimezone(e.target.value)} style={sel}>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST +4)</option>
                    <option value="Asia/Singapore">Asia/Singapore (SGT +8)</option>
                  </select>
                </Field>
                <Field label="Currency">
                  <select name="currency" value={currency} onChange={e => setCurrency(e.target.value)} style={sel}>
                    <option value="INR">INR — Indian Rupee (₹)</option>
                    <option value="USD">USD — US Dollar ($)</option>
                    <option value="EUR">EUR — Euro (€)</option>
                    <option value="GBP">GBP — British Pound (£)</option>
                    <option value="AED">AED — UAE Dirham</option>
                    <option value="SGD">SGD — Singapore Dollar</option>
                  </select>
                </Field>
                <Field label="Date Format">
                  <select name="dateFormat" value={dateFormat} onChange={e => setDateFormat(e.target.value)} style={sel}>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                  </select>
                </Field>
                <Field label="Payroll Processing Day">
                  <select name="payrollDay" value={String(payrollDay)} onChange={e => setPayrollDay(Number(e.target.value))} style={sel}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={String(d)}>{d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"} of every month</option>
                    ))}
                  </select>
                </Field>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "12px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                  <input type="checkbox" checked={wfhEnabled} onChange={e => setWfhEnabled(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "#4f46e5" }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>Enable Work From Home</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Allow employees to mark attendance remotely</div>
                  </div>
                </label>
              </div>
              <WizardNav onBack={undefined} submitLabel="Save & Continue →" submitting={submitting} />
            </fetcher.Form>
          </WizardCard>
        )}

        {/* ── Step 2: Departments ── */}
        {step === 2 && (
          <WizardCard title="Create Departments" subtitle="Add the departments in your company. You can always add more later.">
            {/* Quick add */}
            <fetcher.Form method="post" style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <input type="hidden" name="intent" value="add-dept" />
              <input
                name="name" value={deptInput} onChange={e => setDeptInput(e.target.value)}
                placeholder="Department name (e.g. Engineering)" required
                style={{ ...sel, flex: 1 }} onBlur={() => setDeptInput("")}
              />
              <button type="submit" disabled={submitting || !deptInput.trim()} style={primaryBtn}>Add</button>
            </fetcher.Form>

            {/* Quick presets */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: "#6b7280", alignSelf: "center" }}>Quick add:</span>
              {["Engineering", "Design", "Sales", "HR", "Finance", "Operations", "Marketing"].map(d => (
                departments.some(dep => dep.name === d) ? (
                  <span key={d} style={{ background: "#d1fae5", color: "#065f46", borderRadius: 99, padding: "3px 12px", fontSize: 12, fontWeight: 600 }}>
                    ✓ {d}
                  </span>
                ) : (
                  <fetcher.Form key={d} method="post" style={{ display: "inline" }}>
                    <input type="hidden" name="intent" value="add-dept" />
                    <input type="hidden" name="name" value={d} />
                    <button type="submit" style={{
                      background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db",
                      borderRadius: 99, padding: "3px 12px", fontSize: 12, cursor: "pointer", fontWeight: 500,
                    }}>
                      + {d}
                    </button>
                  </fetcher.Form>
                )
              ))}
            </div>

            {/* Current list */}
            {departments.length > 0 && (
              <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>
                  Created ({departments.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {departments.map(d => (
                    <span key={d.id} style={{
                      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 99,
                      padding: "3px 12px", fontSize: 13, color: "#374151", fontWeight: 500,
                    }}>
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <WizardNav
              onBack={() => setStep(1)}
              onSkip={() => setStep(3)}
              submitLabel={departments.length > 0 ? "Continue →" : "Skip for now →"}
              onNext={() => setStep(3)}
              noSubmit
            />
          </WizardCard>
        )}

        {/* ── Step 3: Invite team ── */}
        {step === 3 && (
          <WizardCard title="Invite Your Team" subtitle="Add employees from the Employees page. You can do this now or after setup.">
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>👥</div>
              <p style={{ color: "#374151", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
                Head to the <strong>Employees</strong> page to invite team members via email.
                Each person will get an invite with a set-password link.
              </p>
              <a href="/hrms/employees" style={{
                display: "inline-block", background: "#4f46e5", color: "#fff",
                borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14,
                textDecoration: "none", marginBottom: 8,
              }}>
                Go to Employees →
              </a>
            </div>
            <WizardNav
              onBack={() => setStep(2)}
              submitLabel="Finish Setup →"
              onNext={() => setStep(4)}
              noSubmit
            />
          </WizardCard>
        )}

        {/* ── Step 4: Complete ── */}
        {step === 4 && (
          <WizardCard title="You're all set! 🎉" subtitle="">
            <div style={{ textAlign: "center", padding: "10px 0 24px" }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🎊</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", marginBottom: 8 }}>
                Setup Complete!
              </div>
              <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.7, maxWidth: 400, margin: "0 auto 28px" }}>
                Your HRMS is ready to use. Invite your team, run payroll, track attendance and more.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <QuickLink href="/hrms" label="🏠 Dashboard" />
                <QuickLink href="/hrms/employees" label="👥 Employees" />
                <QuickLink href="/hrms/payroll" label="💰 Payroll" />
                <QuickLink href="/hrms/announcements" label="📢 Announce" />
              </div>
            </div>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="complete-setup" />
              <div style={{ textAlign: "center", marginTop: 20 }}>
                <button type="submit" disabled={submitting} style={{ ...primaryBtn, padding: "12px 32px", fontSize: 15 }}>
                  {submitting ? "Saving…" : "Go to Dashboard →"}
                </button>
              </div>
            </fetcher.Form>
          </WizardCard>
        )}
      </div>
    </HRMSLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WizardCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "28px 32px", boxShadow: "0 1px 12px rgba(0,0,0,0.06)" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: "0 0 4px" }}>{title}</h2>
        {subtitle && <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{label}</span>
      {children}
    </label>
  );
}

function WizardNav({
  onBack, onNext, onSkip, submitLabel, submitting, noSubmit,
}: {
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  submitLabel?: string;
  submitting?: boolean;
  noSubmit?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, gap: 10 }}>
      <div>
        {onBack && (
          <button type="button" onClick={onBack} style={{ background: "transparent", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#374151" }}>
            ← Back
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {onSkip && (
          <button type="button" onClick={onSkip} style={{ background: "transparent", border: "none", fontSize: 13, cursor: "pointer", color: "#9ca3af", padding: "9px 12px" }}>
            Skip
          </button>
        )}
        {noSubmit && onNext ? (
          <button type="button" onClick={onNext} style={primaryBtn}>{submitLabel ?? "Continue →"}</button>
        ) : (
          <button type="submit" disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Saving…" : (submitLabel ?? "Continue →")}
          </button>
        )}
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} style={{
      display: "inline-block", background: "#f3f4f6", color: "#374151",
      borderRadius: 8, padding: "8px 18px", fontWeight: 600, fontSize: 13,
      textDecoration: "none", border: "1px solid #e5e7eb",
    }}>
      {label}
    </a>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sel: React.CSSProperties = { padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#111827", background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" };
