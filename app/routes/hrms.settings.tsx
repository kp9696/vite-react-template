import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.settings";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TenantSettings {
  timezone: string;
  dateFormat: string;
  currency: string;
  officeLat: number | null;
  officeLng: number | null;
  geoFenceRadius: number;
  officeCheckinRequired: boolean;
  wfhEnabled: boolean;
  payrollDay: number;
  companyLogoUrl: string | null;
  setupCompleted: boolean;
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  head_user_id: string | null;
  head_name: string | null;
  member_count: number;
}

type Tab = "company" | "departments" | "geofence";

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Settings" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const isAdmin = isAdminRole(currentUser.role);

  const [settingsRes, deptsRes] = await Promise.all([
    callCoreHrmsApi<{ settings: TenantSettings }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/tenant/settings",
    }),
    callCoreHrmsApi<{ departments: Department[] }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/departments",
    }),
  ]);

  return {
    currentUser,
    isAdmin,
    settings: settingsRes?.settings ?? {
      timezone: "Asia/Kolkata",
      dateFormat: "DD/MM/YYYY",
      currency: "INR",
      officeLat: null,
      officeLng: null,
      geoFenceRadius: 200,
      officeCheckinRequired: false,
      wfhEnabled: true,
      payrollDay: 1,
      companyLogoUrl: null,
      setupCompleted: false,
    },
    departments: deptsRes?.departments ?? [],
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "save-settings") {
    const result = await callCoreHrmsApi<{ ok: boolean }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/tenant/settings",
      method: "POST",
      body: {
        timezone: String(formData.get("timezone") || "Asia/Kolkata"),
        dateFormat: String(formData.get("dateFormat") || "DD/MM/YYYY"),
        currency: String(formData.get("currency") || "INR"),
        payrollDay: Number(formData.get("payrollDay") || 1),
        wfhEnabled: formData.get("wfhEnabled") === "true",
        officeCheckinRequired: formData.get("officeCheckinRequired") === "true",
      },
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Settings saved." : "Failed to save settings." };
  }

  if (intent === "create-dept") {
    const result = await callCoreHrmsApi<{ ok: boolean; id?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/departments",
      method: "POST",
      body: {
        name: String(formData.get("name") || "").trim(),
        description: String(formData.get("description") || "").trim() || undefined,
      },
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Department created." : "Failed to create department." };
  }

  if (intent === "delete-dept") {
    const deptId = String(formData.get("deptId") || "");
    const result = await callCoreHrmsApi<{ ok: boolean }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/departments/${deptId}`,
      method: "DELETE",
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Department deleted." : "Failed to delete department." };
  }

  return { ok: false, intent, message: "Unknown action." };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { currentUser, isAdmin, settings, departments } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; intent: string; message: string }>();

  const [activeTab, setActiveTab] = useState<Tab>("company");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // New department form state
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptDesc, setNewDeptDesc] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Show toast on action result
  useEffect(() => {
    if (fetcher.data?.message) {
      setToast({ msg: fetcher.data.message, ok: fetcher.data.ok });
      const t = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [fetcher.data]);

  // Reset new dept form after successful creation
  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.intent === "create-dept") {
      setNewDeptName("");
      setNewDeptDesc("");
    }
  }, [fetcher.data]);

  const saving = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "save-settings";
  const creatingDept = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "create-dept";

  return (
    <HRMSLayout currentUser={currentUser}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 24,
            zIndex: 9999,
            background: toast.ok ? "#10b981" : "#ef4444",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          }}
        >
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>
        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Company Settings</h1>
          <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
            Manage your organisation preferences, departments, and attendance policies.
          </p>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            borderBottom: "2px solid #e5e7eb",
            marginBottom: 28,
          }}
        >
          {([
            { key: "company", label: "Company Profile" },
            { key: "departments", label: "Departments" },
            { key: "geofence", label: "Geo-fence" },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "8px 18px",
                border: "none",
                borderBottom: activeTab === t.key ? "2px solid #4f46e5" : "2px solid transparent",
                background: "none",
                cursor: "pointer",
                fontWeight: activeTab === t.key ? 700 : 500,
                color: activeTab === t.key ? "#4f46e5" : "#6b7280",
                fontSize: 14,
                marginBottom: -2,
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Company Profile ── */}
        {activeTab === "company" && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 28,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 20px" }}>
              General Preferences
            </h2>

            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="save-settings" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Timezone */}
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Timezone</span>
                  <select name="timezone" defaultValue={settings.timezone} style={inputStyle}>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST, +5:30)</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST, +4)</option>
                    <option value="Asia/Singapore">Asia/Singapore (SGT, +8)</option>
                  </select>
                </label>

                {/* Date Format */}
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Date Format</span>
                  <select name="dateFormat" defaultValue={settings.dateFormat} style={inputStyle}>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                  </select>
                </label>

                {/* Currency */}
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Currency</span>
                  <select name="currency" defaultValue={settings.currency} style={inputStyle}>
                    <option value="INR">INR — Indian Rupee (₹)</option>
                    <option value="USD">USD — US Dollar ($)</option>
                    <option value="EUR">EUR — Euro (€)</option>
                    <option value="GBP">GBP — British Pound (£)</option>
                    <option value="AED">AED — UAE Dirham (د.إ)</option>
                    <option value="SGD">SGD — Singapore Dollar (S$)</option>
                  </select>
                </label>

                {/* Payroll Day */}
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Payroll Processing Day</span>
                  <select name="payrollDay" defaultValue={String(settings.payrollDay)} style={inputStyle}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={String(d)}>
                        {d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"} of every month
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Toggles */}
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <ToggleRow
                  label="Work from Home (WFH) Enabled"
                  description="Allow employees to mark attendance from home."
                  name="wfhEnabled"
                  defaultChecked={settings.wfhEnabled}
                  disabled={!isAdmin}
                />
                <ToggleRow
                  label="Require Office Check-in"
                  description="Employees must be within geo-fence radius to check in."
                  name="officeCheckinRequired"
                  defaultChecked={settings.officeCheckinRequired}
                  disabled={!isAdmin}
                />
              </div>

              {isAdmin && (
                <div style={{ marginTop: 24 }}>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      background: "#4f46e5",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "9px 22px",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: saving ? "not-allowed" : "pointer",
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving ? "Saving…" : "Save Settings"}
                  </button>
                </div>
              )}
            </fetcher.Form>
          </div>
        )}

        {/* ── Tab: Departments ── */}
        {activeTab === "departments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Add department (admin only) */}
            {isAdmin && (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 24,
                }}
              >
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>
                  Add Department
                </h2>
                <fetcher.Form method="post" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <input type="hidden" name="intent" value="create-dept" />
                  <input
                    name="name"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    placeholder="Department name *"
                    required
                    style={{ ...inputStyle, flex: "1 1 180px", minWidth: 160 }}
                  />
                  <input
                    name="description"
                    value={newDeptDesc}
                    onChange={(e) => setNewDeptDesc(e.target.value)}
                    placeholder="Description (optional)"
                    style={{ ...inputStyle, flex: "2 1 240px" }}
                  />
                  <button
                    type="submit"
                    disabled={creatingDept || !newDeptName.trim()}
                    style={{
                      background: "#4f46e5",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "9px 20px",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: creatingDept || !newDeptName.trim() ? "not-allowed" : "pointer",
                      opacity: creatingDept || !newDeptName.trim() ? 0.6 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {creatingDept ? "Adding…" : "+ Add"}
                  </button>
                </fetcher.Form>
              </div>
            )}

            {/* Department list */}
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid #f3f4f6",
                  fontWeight: 700,
                  fontSize: 15,
                  color: "#111827",
                }}
              >
                Departments ({departments.length})
              </div>

              {departments.length === 0 ? (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    color: "#9ca3af",
                    fontSize: 14,
                  }}
                >
                  No departments yet. Add one above.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Description</th>
                      <th style={thStyle}>Head</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Members</th>
                      {isAdmin && <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((dept) => (
                      <tr
                        key={dept.id}
                        style={{ borderTop: "1px solid #f3f4f6" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={tdStyle}>
                          <span
                            style={{
                              fontWeight: 600,
                              color: "#111827",
                              fontSize: 14,
                            }}
                          >
                            {dept.name}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: "#6b7280", fontSize: 13 }}>
                          {dept.description || "—"}
                        </td>
                        <td style={{ ...tdStyle, color: "#374151", fontSize: 13 }}>
                          {dept.head_name || "—"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <span
                            style={{
                              background: "#ede9fe",
                              color: "#6d28d9",
                              borderRadius: 999,
                              padding: "2px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {dept.member_count}
                          </span>
                        </td>
                        {isAdmin && (
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            {confirmDeleteId === dept.id ? (
                              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                                <span style={{ fontSize: 12, color: "#ef4444" }}>Delete?</span>
                                <fetcher.Form method="post" style={{ display: "inline" }}>
                                  <input type="hidden" name="intent" value="delete-dept" />
                                  <input type="hidden" name="deptId" value={dept.id} />
                                  <button
                                    type="submit"
                                    style={{
                                      background: "#ef4444",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 6,
                                      padding: "3px 10px",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                    onClick={() => setConfirmDeleteId(null)}
                                  >
                                    Yes
                                  </button>
                                </fetcher.Form>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  style={{
                                    background: "#e5e7eb",
                                    color: "#374151",
                                    border: "none",
                                    borderRadius: 6,
                                    padding: "3px 10px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  No
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(dept.id)}
                                style={{
                                  background: "transparent",
                                  border: "1px solid #fca5a5",
                                  borderRadius: 6,
                                  color: "#ef4444",
                                  padding: "3px 10px",
                                  fontSize: 12,
                                  cursor: "pointer",
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Geo-fence ── */}
        {activeTab === "geofence" && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 32,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>📍</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
              Geo-fence Configuration
            </h2>
            <p style={{ color: "#6b7280", fontSize: 14, maxWidth: 420, margin: "0 auto 20px" }}>
              Set your office location and radius to enable location-based attendance. Employees
              must be within range to check in.
            </p>
            <div
              style={{
                display: "inline-block",
                background: "#fef3c7",
                border: "1px solid #fde68a",
                borderRadius: 8,
                padding: "10px 20px",
                color: "#92400e",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              🚧 Coming in Phase 2 — Geo-fence attendance setup
            </div>

            <div
              style={{
                marginTop: 28,
                padding: 20,
                background: "#f9fafb",
                borderRadius: 8,
                textAlign: "left",
                maxWidth: 420,
                margin: "28px auto 0",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 12 }}>
                Current Config
              </div>
              <div style={infoRowStyle}>
                <span style={{ color: "#6b7280" }}>Geo-fence radius</span>
                <span style={{ fontWeight: 600 }}>{settings.geoFenceRadius} m</span>
              </div>
              <div style={infoRowStyle}>
                <span style={{ color: "#6b7280" }}>Office check-in required</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: settings.officeCheckinRequired ? "#059669" : "#6b7280",
                  }}
                >
                  {settings.officeCheckinRequired ? "Yes" : "No"}
                </span>
              </div>
              <div style={infoRowStyle}>
                <span style={{ color: "#6b7280" }}>Office coordinates</span>
                <span style={{ fontWeight: 600 }}>
                  {settings.officeLat != null && settings.officeLng != null
                    ? `${settings.officeLat.toFixed(4)}, ${settings.officeLng.toFixed(4)}`
                    : "Not set"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </HRMSLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  name,
  defaultChecked,
  disabled,
}: {
  label: string;
  description: string;
  name: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        padding: "14px 16px",
        background: "#f9fafb",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{label}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{description}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {/* Hidden boolean value */}
        <input type="hidden" name={name} value={checked ? "true" : "false"} />
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => !disabled && setChecked((v) => !v)}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            background: checked ? "#4f46e5" : "#d1d5db",
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            position: "relative",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: checked ? 22 : 2,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            }}
          />
        </button>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: checked ? "#4f46e5" : "#9ca3af",
            width: 28,
          }}
        >
          {checked ? "On" : "Off"}
        </span>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelTextStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
  color: "#111827",
  background: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  verticalAlign: "middle",
};

const infoRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 13,
  padding: "6px 0",
  borderBottom: "1px solid #e5e7eb",
};
