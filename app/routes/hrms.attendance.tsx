import { useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/hrms.attendance";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { avatarColor, getInitials, isAdminRole } from "../lib/hrms.shared";

// ── Types ────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: string;
  user_id: string;
  name: string;
  email: string;
  attendance_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
  check_in_ip?: string;
  check_out_ip?: string;
}

interface MyAttendanceRecord {
  id: string;
  attendance_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
  hours_worked?: number;
}

interface TodayResponse {
  date: string;
  records: AttendanceRecord[];
}

interface MyAttendanceResponse {
  records: MyAttendanceRecord[];
}

interface CheckInOutResponse {
  ok?: boolean;
  error?: string;
  checkInAt?: string;
  checkOutAt?: string;
  attendanceDate?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return iso;
  }
}

function hoursWorked(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return "—";
  try {
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  } catch {
    return "—";
  }
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "present") return "badge-green";
  if (s === "absent") return "badge-red";
  if (s === "half_day" || s === "half-day") return "badge-amber";
  if (s === "wfh") return "badge-blue";
  if (s === "on_leave" || s === "on-leave") return "badge-purple";
  return "badge-blue";
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    present: "Present",
    absent: "Absent",
    half_day: "Half Day",
    wfh: "WFH",
    on_leave: "On Leave",
    "half-day": "Half Day",
    "on-leave": "On Leave",
  };
  return map[status.toLowerCase()] ?? status;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_SHORT = ["S","M","T","W","T","F","S"];

// ── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Attendance" }];
}

// ── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const isManager = isAdminRole(currentUser.role);

  // Today's team attendance (HR only)
  let todayRecords: AttendanceRecord[] = [];
  if (isManager) {
    const todayRes = await callCoreHrmsApi<TodayResponse>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/attendance/today",
    });
    todayRecords = todayRes?.records ?? [];
  }

  // My attendance history (last 30 days)
  const myRes = await callCoreHrmsApi<MyAttendanceResponse>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/attendance/my",
  });
  const myRecords: MyAttendanceRecord[] = myRes?.records ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const myToday = myRecords.find((r) => r.attendance_date === today) ?? null;

  return { currentUser, isManager, todayRecords, myRecords, myToday, today };
}

// ── Action ───────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs): Promise<CheckInOutResponse> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "check-in") {
    const geo = String(formData.get("geo") || "").trim();
    const res = await callCoreHrmsApi<CheckInOutResponse>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/attendance/check-in",
      method: "POST",
      body: { geo: geo || undefined },
    });
    if (!res?.ok) return { error: res?.error || "Check-in failed." };
    return { ok: true, checkInAt: res.checkInAt, attendanceDate: res.attendanceDate };
  }

  if (intent === "check-out") {
    const geo = String(formData.get("geo") || "").trim();
    const res = await callCoreHrmsApi<CheckInOutResponse>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/attendance/check-out",
      method: "POST",
      body: { geo: geo || undefined },
    });
    if (!res?.ok) return { error: res?.error || "Check-out failed." };
    return { ok: true, checkOutAt: res.checkOutAt, attendanceDate: res.attendanceDate };
  }

  return { error: "Unsupported action." };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Attendance() {
  const { currentUser, isManager, todayRecords, myRecords, myToday, today } =
    useLoaderData<typeof loader>();

  const fetcher = useFetcher<CheckInOutResponse>();
  const [tab, setTab] = useState<"today" | "my" | "calendar">(isManager ? "today" : "my");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [localToday, setLocalToday] = useState(myToday);
  const [calDate, setCalDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Build calendar data from myRecords
  const recordsByDate = Object.fromEntries(myRecords.map((r) => [r.attendance_date, r]));

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Handle check-in / check-out response
  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (data.error) {
      setToast({ msg: data.error, ok: false });
      return;
    }
    if (data.ok) {
      if (data.checkInAt) {
        setLocalToday((prev) => ({
          id: prev?.id ?? "",
          attendance_date: data.attendanceDate ?? today,
          check_in_at: data.checkInAt!,
          check_out_at: prev?.check_out_at ?? null,
          status: "present",
        }));
        setToast({ msg: "✓ Checked in successfully!", ok: true });
      } else if (data.checkOutAt) {
        setLocalToday((prev) =>
          prev ? { ...prev, check_out_at: data.checkOutAt! } : prev
        );
        setToast({ msg: "✓ Checked out successfully!", ok: true });
      }
    }
  }, [fetcher.data, today]);

  const handleCheckIn = () => {
    const fd = new FormData();
    fd.set("intent", "check-in");
    fetcher.submit(fd, { method: "POST" });
  };

  const handleCheckOut = () => {
    const fd = new FormData();
    fd.set("intent", "check-out");
    fetcher.submit(fd, { method: "POST" });
  };

  // Calendar helpers
  const { year, month } = calDate;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthCal = () => month === 0 ? setCalDate({ year: year - 1, month: 11 }) : setCalDate({ year, month: month - 1 });
  const nextMonthCal = () => month === 11 ? setCalDate({ year: year + 1, month: 0 }) : setCalDate({ year, month: month + 1 });

  // Stats
  const presentDays = myRecords.filter((r) => r.status === "present").length;
  const absentDays = myRecords.filter((r) => r.status === "absent").length;
  const wfhDays = myRecords.filter((r) => r.status === "wfh").length;
  const totalDays = myRecords.length;
  const attendancePct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  const todayPresent = todayRecords.filter((r) => r.check_in_at).length;

  const isSubmitting = fetcher.state !== "idle";

  return (
    <HRMSLayout currentUser={currentUser}>
      {/* Toast */}
      {toast ? (
        <div className={`toast ${toast.ok ? "toast-success" : "toast-error"}`}>
          {toast.msg}
        </div>
      ) : null}

      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Attendance</div>
          <div className="page-sub">Track daily check-ins, work hours, and attendance history.</div>
        </div>
        {/* Check-in / Check-out panel */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{
            background: "white", border: "1.5px solid var(--border)", borderRadius: 12,
            padding: "14px 20px", display: "flex", alignItems: "center", gap: 16,
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--ink-3)", marginBottom: 2 }}>Check In</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: localToday?.check_in_at ? "var(--green)" : "var(--ink-3)" }}>
                {localToday?.check_in_at ? fmtTime(localToday.check_in_at) : "—"}
              </div>
            </div>
            <div style={{ width: 1, height: 36, background: "var(--border)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--ink-3)", marginBottom: 2 }}>Check Out</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: localToday?.check_out_at ? "var(--accent)" : "var(--ink-3)" }}>
                {localToday?.check_out_at ? fmtTime(localToday.check_out_at) : "—"}
              </div>
            </div>
            <div style={{ width: 1, height: 36, background: "var(--border)" }} />
            <div style={{ display: "flex", gap: 8 }}>
              {!localToday?.check_in_at ? (
                <button
                  className="btn btn-primary"
                  onClick={handleCheckIn}
                  disabled={isSubmitting}
                  style={{ padding: "8px 18px" }}
                >
                  {isSubmitting ? "…" : "▶ Check In"}
                </button>
              ) : !localToday?.check_out_at ? (
                <button
                  className="btn btn-danger"
                  onClick={handleCheckOut}
                  disabled={isSubmitting}
                  style={{ padding: "8px 18px" }}
                >
                  {isSubmitting ? "…" : "■ Check Out"}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>
                  ✓ Done · {hoursWorked(localToday.check_in_at, localToday.check_out_at)}
                </span>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Present Days</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>{presentDays}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Last 30 days</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Attendance %</div>
          <div className="stat-value" style={{ color: attendancePct >= 90 ? "var(--green)" : attendancePct >= 75 ? "var(--amber)" : "var(--red)" }}>
            {totalDays > 0 ? `${attendancePct}%` : "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
            <div className="progress-track" style={{ marginTop: 6 }}>
              <div className="progress-fill" style={{ width: `${attendancePct}%`, background: attendancePct >= 90 ? "var(--green)" : "var(--amber)" }} />
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">WFH Days</div>
          <div className="stat-value" style={{ color: "var(--accent)" }}>{wfhDays}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>This month</div>
        </div>
        {isManager ? (
          <div className="stat-card">
            <div className="stat-label">Team Present Today</div>
            <div className="stat-value" style={{ color: "var(--green)" }}>{todayPresent}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>of {todayRecords.length} checked in</div>
          </div>
        ) : (
          <div className="stat-card">
            <div className="stat-label">Absent Days</div>
            <div className="stat-value" style={{ color: absentDays > 3 ? "var(--red)" : "var(--ink)" }}>{absentDays}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>This month</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {isManager && (
          <button className={`tab-btn ${tab === "today" ? "active" : ""}`} onClick={() => setTab("today")}>
            Today's Team{todayPresent > 0 ? ` (${todayPresent})` : ""}
          </button>
        )}
        <button className={`tab-btn ${tab === "my" ? "active" : ""}`} onClick={() => setTab("my")}>My History</button>
        <button className={`tab-btn ${tab === "calendar" ? "active" : ""}`} onClick={() => setTab("calendar")}>Calendar</button>
      </div>

      {/* Today's team tab (HR only) */}
      {tab === "today" && isManager && (
        <div className="card">
          {todayRecords.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🕐</div>
              <div className="empty-state-title">No check-ins yet today</div>
              <div className="empty-state-sub">Records will appear once employees check in.</div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {todayRecords.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="avatar-sm" style={{ background: avatarColor(r.name) }}>
                          {getInitials(r.name)}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: r.check_in_at ? "var(--green)" : "var(--ink-3)" }}>
                        {fmtTime(r.check_in_at)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: r.check_out_at ? "var(--accent)" : "var(--ink-3)" }}>
                        {fmtTime(r.check_out_at)}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {hoursWorked(r.check_in_at, r.check_out_at)}
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* My history tab */}
      {tab === "my" && (
        <div className="card">
          {myRecords.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📅</div>
              <div className="empty-state-title">No attendance records yet</div>
              <div className="empty-state-sub">Use Check In / Check Out above to start tracking.</div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Hours Worked</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {myRecords.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      {new Date(r.attendance_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                    </td>
                    <td style={{ color: r.check_in_at ? "var(--green)" : "var(--ink-3)", fontWeight: 600 }}>
                      {fmtTime(r.check_in_at)}
                    </td>
                    <td style={{ color: r.check_out_at ? "var(--accent)" : "var(--ink-3)", fontWeight: 600 }}>
                      {fmtTime(r.check_out_at)}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {hoursWorked(r.check_in_at, r.check_out_at)}
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Calendar tab */}
      {tab === "calendar" && (
        <div className="card">
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <button className="btn btn-outline" style={{ padding: "6px 12px" }} onClick={prevMonthCal}>‹</button>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)" }}>
              {["January","February","March","April","May","June","July","August","September","October","November","December"][month]} {year}
            </div>
            <button className="btn btn-outline" style={{ padding: "6px 12px" }} onClick={nextMonthCal}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", paddingBottom: 6 }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const rec = recordsByDate[iso];
              const isToday = iso === today;
              const isWeekend = ((firstDay + i) % 7 === 0) || ((firstDay + i) % 7 === 6);
              const isFuture = iso > today;

              let bg = "white";
              let borderColor = "var(--border)";
              let dotColor: string | null = null;

              if (isToday) { bg = "var(--accent-light)"; borderColor = "var(--accent)"; }
              else if (isWeekend && !rec) { bg = "var(--surface)"; }

              if (rec) {
                const s = rec.status.toLowerCase();
                if (s === "present") dotColor = "var(--green)";
                else if (s === "absent") dotColor = "var(--red)";
                else if (s === "wfh") dotColor = "var(--accent)";
                else if (s === "half_day" || s === "half-day") dotColor = "var(--amber)";
              }

              return (
                <div
                  key={day}
                  style={{
                    minHeight: 62, padding: "7px 9px",
                    borderRadius: 10, border: `${isToday ? "2px" : "1px"} solid ${borderColor}`,
                    background: bg, opacity: isFuture ? 0.45 : 1,
                    transition: "box-shadow 0.12s",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? "var(--accent)" : isWeekend ? "var(--ink-3)" : "var(--ink)", marginBottom: 5 }}>
                    {day}
                  </div>
                  {dotColor && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
                  )}
                  {rec && (
                    <div style={{ fontSize: 9, fontWeight: 600, color: dotColor ?? "var(--ink-3)", marginTop: 3, lineHeight: 1.3 }}>
                      {rec.check_in_at ? fmtTime(rec.check_in_at) : statusLabel(rec.status)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ marginTop: 20, display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { color: "var(--green)", label: "Present" },
              { color: "var(--red)", label: "Absent" },
              { color: "var(--accent)", label: "WFH" },
              { color: "var(--amber)", label: "Half Day" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}
    </HRMSLayout>
  );
}
