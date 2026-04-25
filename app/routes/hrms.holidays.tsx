import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.holidays";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Holiday {
  id: string;
  name: string;
  date: string;      // YYYY-MM-DD
  type: string;      // national | restricted | optional
  description: string | null;
  created_at: string;
}

type ActionResult = { ok: boolean; message: string; type?: "success" | "error" };

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Holiday Calendar" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const year = new URL(request.url).searchParams.get("year") ?? new Date().getFullYear().toString();
  const isAdmin = isAdminRole(currentUser.role);

  const res = await callCoreHrmsApi<{ holidays: Holiday[]; year: string }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: `/api/holidays?year=${year}`,
  });

  return {
    currentUser,
    isAdmin,
    holidays: res?.holidays ?? [],
    year: Number(year),
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  if (!isAdminRole(currentUser.role)) {
    return { ok: false, type: "error", message: "Only admins can manage holidays." };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "add") {
    const name = String(formData.get("name") ?? "").trim();
    const date = String(formData.get("date") ?? "").trim();
    const type = String(formData.get("type") ?? "national").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (!name || !date) return { ok: false, type: "error", message: "Name and date are required." };

    const res = await callCoreHrmsApi<{ ok: boolean; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/holidays",
      method: "POST",
      body: { name, date, type, description: description || undefined },
    });
    return { ok: res?.ok ?? false, type: res?.ok ? "success" : "error", message: res?.error ?? "Holiday added." };
  }

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, type: "error", message: "Holiday ID missing." };
    const res = await callCoreHrmsApi<{ ok: boolean; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/holidays/${id}`,
      method: "DELETE",
    });
    return { ok: res?.ok ?? false, type: res?.ok ? "success" : "error", message: res?.error ?? "Holiday deleted." };
  }

  return { ok: false, type: "error", message: "Unknown action." };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  national:   { label: "National",   bg: "#ede9fe", color: "#7c3aed", border: "#c4b5fd" },
  restricted: { label: "Restricted", bg: "#fff7ed", color: "#c2410c", border: "#fdba74" },
  optional:   { label: "Optional",   bg: "#f0fdf4", color: "#15803d", border: "#86efac" },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return WEEKDAYS[d.getDay()];
}

function groupByMonth(holidays: Holiday[]): Record<string, Holiday[]> {
  const result: Record<string, Holiday[]> = {};
  for (const h of holidays) {
    const month = h.date.slice(0, 7); // YYYY-MM
    if (!result[month]) result[month] = [];
    result[month].push(h);
  }
  return result;
}

// ── Pre-seeded Indian National Holidays ──────────────────────────────────────

const NATIONAL_HOLIDAYS_2026 = [
  { name: "Republic Day", date: "2026-01-26", type: "national" },
  { name: "Holi", date: "2026-03-23", type: "national" },
  { name: "Good Friday", date: "2026-04-03", type: "national" },
  { name: "Dr. Ambedkar Jayanti", date: "2026-04-14", type: "national" },
  { name: "Ram Navami", date: "2026-04-05", type: "national" },
  { name: "Eid-ul-Fitr", date: "2026-03-31", type: "national" },
  { name: "Eid-ul-Adha", date: "2026-06-07", type: "national" },
  { name: "Independence Day", date: "2026-08-15", type: "national" },
  { name: "Gandhi Jayanti", date: "2026-10-02", type: "national" },
  { name: "Dussehra", date: "2026-10-19", type: "national" },
  { name: "Diwali", date: "2026-11-08", type: "national" },
  { name: "Guru Nanak Jayanti", date: "2026-11-25", type: "national" },
  { name: "Christmas", date: "2026-12-25", type: "national" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function HolidayCalendar() {
  const { currentUser, isAdmin, holidays, year } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();

  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [formData, setFormData] = useState({
    name: "", date: "", type: "national", description: "",
  });

  const isSubmitting = fetcher.state !== "idle";
  const toast = fetcher.data;

  const filtered = filterType === "all" ? holidays : holidays.filter((h) => h.type === filterType);
  const grouped = groupByMonth(filtered);
  const monthKeys = Object.keys(grouped).sort();

  const totalNational = holidays.filter((h) => h.type === "national").length;
  const totalRestricted = holidays.filter((h) => h.type === "restricted").length;
  const totalOptional = holidays.filter((h) => h.type === "optional").length;

  function handleSeed() {
    const year2026 = NATIONAL_HOLIDAYS_2026;
    for (const h of year2026) {
      const fd = new FormData();
      fd.append("intent", "add");
      fd.append("name", h.name);
      fd.append("date", h.date);
      fd.append("type", h.type);
      fetcher.submit(fd, { method: "post" });
    }
  }

  return (
    <HRMSLayout currentUser={currentUser}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 0" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
              Holiday Calendar {year}
            </h1>
            <p style={{ fontSize: 13, color: "#64748b" }}>
              {holidays.length} holidays · {totalNational} national · {totalRestricted} restricted · {totalOptional} optional
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {/* Year navigation */}
            <a href={`?year=${year - 1}`} style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0",
              fontSize: 13, color: "#475569", textDecoration: "none", fontWeight: 500,
            }}>← {year - 1}</a>
            <a href={`?year=${year + 1}`} style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0",
              fontSize: 13, color: "#475569", textDecoration: "none", fontWeight: 500,
            }}>{year + 1} →</a>
            {isAdmin && holidays.length === 0 && (
              <button onClick={handleSeed} style={{
                padding: "8px 14px", borderRadius: 8,
                background: "#f0fdf4", border: "1px solid #86efac",
                fontSize: 13, color: "#15803d", fontWeight: 600, cursor: "pointer",
              }}>
                + Seed 2026 Holidays
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setShowForm(!showForm)} style={{
                padding: "8px 18px", borderRadius: 8,
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                color: "white", fontWeight: 700, fontSize: 13,
                border: "none", cursor: "pointer",
              }}>
                {showForm ? "Cancel" : "+ Add Holiday"}
              </button>
            )}
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{
            marginBottom: 16, padding: "12px 16px", borderRadius: 10,
            background: toast.ok ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${toast.ok ? "#86efac" : "#fecaca"}`,
            color: toast.ok ? "#15803d" : "#dc2626",
            fontSize: 13, fontWeight: 600,
          }}>
            {toast.message}
          </div>
        )}

        {/* Add Holiday Form */}
        {showForm && isAdmin && (
          <div style={{
            background: "white", border: "1px solid #e2e8f0", borderRadius: 14,
            padding: 24, marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>Add Holiday</div>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="add" />
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
                    Holiday Name *
                  </label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Diwali"
                    required
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
                    Date *
                  </label>
                  <input
                    name="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
                    required
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
                    Type
                  </label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={(e) => setFormData((p) => ({ ...p, type: e.target.value }))}
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
                      background: "white",
                    }}
                  >
                    <option value="national">National</option>
                    <option value="restricted">Restricted</option>
                    <option value="optional">Optional</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
                    Description
                  </label>
                  <input
                    name="description"
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Optional"
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
                    }}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: "10px 24px", borderRadius: 8, border: "none",
                  background: "#6366f1", color: "white", fontWeight: 700,
                  fontSize: 13, cursor: "pointer", opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? "Saving…" : "Add Holiday"}
              </button>
            </fetcher.Form>
          </div>
        )}

        {/* Filter Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { value: "all", label: `All (${holidays.length})` },
            { value: "national", label: `National (${totalNational})` },
            { value: "restricted", label: `Restricted (${totalRestricted})` },
            { value: "optional", label: `Optional (${totalOptional})` },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilterType(tab.value)}
              style={{
                padding: "7px 16px", borderRadius: 20, border: "1px solid",
                borderColor: filterType === tab.value ? "#6366f1" : "#e2e8f0",
                background: filterType === tab.value ? "#eef2ff" : "white",
                color: filterType === tab.value ? "#4f46e5" : "#64748b",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Holiday List grouped by Month */}
        {holidays.length === 0 ? (
          <div style={{
            background: "white", border: "1px solid #e2e8f0", borderRadius: 14,
            padding: "40px 24px", textAlign: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>No holidays added yet</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {isAdmin ? 'Click "+ Add Holiday" or "Seed 2026 Holidays" to get started.' : "Holidays will appear here once added by HR."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {monthKeys.map((monthKey) => {
              const [y, m] = monthKey.split("-").map(Number);
              const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
                month: "long", year: "numeric", timeZone: "UTC",
              });
              const monthHolidays = grouped[monthKey];
              return (
                <div key={monthKey} style={{
                  background: "white", border: "1px solid #e2e8f0",
                  borderRadius: 14, overflow: "hidden",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}>
                  <div style={{
                    background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
                    padding: "12px 20px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{monthLabel}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: "#64748b",
                      background: "#e2e8f0", borderRadius: 20, padding: "2px 10px",
                    }}>
                      {monthHolidays.length} holiday{monthHolidays.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div>
                    {monthHolidays.map((h, idx) => {
                      const tc = TYPE_CONFIG[h.type] ?? TYPE_CONFIG.national;
                      return (
                        <div key={h.id} style={{
                          display: "flex", alignItems: "center", gap: 16,
                          padding: "14px 20px",
                          borderBottom: idx < monthHolidays.length - 1 ? "1px solid #f1f5f9" : "none",
                        }}>
                          {/* Date badge */}
                          <div style={{
                            width: 48, height: 48, borderRadius: 10,
                            background: tc.bg, border: `1px solid ${tc.border}`,
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: tc.color, lineHeight: 1 }}>
                              {h.date.slice(8)}
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: tc.color, textTransform: "uppercase" }}>
                              {getDayOfWeek(h.date)}
                            </span>
                          </div>
                          {/* Name + details */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{h.name}</div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
                              <span style={{ fontSize: 11, color: "#94a3b8" }}>{formatDate(h.date)}</span>
                              {h.description && (
                                <span style={{ fontSize: 11, color: "#94a3b8" }}>· {h.description}</span>
                              )}
                            </div>
                          </div>
                          {/* Type badge */}
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "3px 10px",
                            borderRadius: 20, background: tc.bg, color: tc.color,
                            border: `1px solid ${tc.border}`, textTransform: "uppercase", letterSpacing: 0.5,
                          }}>
                            {tc.label}
                          </span>
                          {/* Delete */}
                          {isAdmin && (
                            <fetcher.Form method="post" style={{ marginLeft: 4 }}>
                              <input type="hidden" name="intent" value="delete" />
                              <input type="hidden" name="id" value={h.id} />
                              <button
                                type="submit"
                                title="Delete"
                                style={{
                                  width: 30, height: 30, borderRadius: 8, border: "none",
                                  background: "#fef2f2", color: "#ef4444",
                                  display: "grid", placeItems: "center",
                                  cursor: "pointer", fontSize: 14,
                                }}
                                onClick={(e) => {
                                  if (!confirm(`Delete "${h.name}"?`)) e.preventDefault();
                                }}
                              >
                                ✕
                              </button>
                            </fetcher.Form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </HRMSLayout>
  );
}
