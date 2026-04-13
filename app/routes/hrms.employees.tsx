import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.employees";
import HRMSLayout from "../components/HRMSLayout";
import { DEMO_USER } from "../lib/hrms.server";
import { avatarColor, getInitials } from "../lib/hrms.shared";
import { requireSignedInUser } from "../lib/session.server";
import { createEmployee, getDemoEmployeesDashboard, getEmployeesDashboard } from "../lib/workforce.server";

const departments = ["All", "Engineering", "Design", "Analytics", "Sales", "People Ops", "Marketing", "Finance", "Operations"];
const statuses = ["All", "Active", "Onboarding", "On Leave"];

type ActionResult = { ok: boolean; message: string; type: "success" | "error" };

export function meta() {
  return [{ title: "JWithKP HRMS - Employees" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  const data = currentUser.id === DEMO_USER.id
    ? getDemoEmployeesDashboard()
    : currentUser.orgId
      ? await getEmployeesDashboard(context.cloudflare.env.HRMS, currentUser.orgId)
      : getDemoEmployeesDashboard();
  return { currentUser, ...data };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  if (currentUser.id === DEMO_USER.id) {
    return { ok: false, type: "error", message: "Demo workspace employee records are read-only." };
  }
  if (!currentUser.orgId) {
    return { ok: false, type: "error", message: "Organization not found for this user." };
  }
  const formData = await request.formData();
  await createEmployee(context.cloudflare.env.HRMS, {
    orgId: currentUser.orgId,
    name: String(formData.get("name") || "").trim(),
    role: String(formData.get("role") || "").trim(),
    department: String(formData.get("department") || "").trim(),
    location: String(formData.get("location") || "").trim(),
    joinedOn: String(formData.get("joinedOn") || "").trim(),
    salary: String(formData.get("salary") || "").trim(),
    status: String(formData.get("status") || "Active").trim(),
  });
  return { ok: true, type: "success", message: "Employee added successfully." };
}

export default function Employees() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [status, setStatus] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<ActionResult | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fetcher.data) {
      setToast(fetcher.data);
      if (fetcher.data.ok) setShowForm(false);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    }
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [fetcher.data]);

  const filtered = useMemo(() => data.view.filter((emp) => {
    const q = search.toLowerCase();
    return (emp.name.toLowerCase().includes(q) || emp.role.toLowerCase().includes(q))
      && (department === "All" || emp.department === department)
      && (status === "All" || emp.status === status);
  }), [data.view, search, department, status]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.view.forEach((e) => { counts[e.department] = (counts[e.department] ?? 0) + 1; });
    return counts;
  }, [data.view]);

  return (
    <HRMSLayout currentUser={data.currentUser}>
      {toast ? (
        <div className={`toast toast-${toast.type}`} onClick={() => setToast(null)} style={{ cursor: "pointer" }}>
          <span>{toast.type === "success" ? "✓" : "✕"}</span>
          {toast.message}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Employees</div>
          <div className="page-sub">
            {data.view.length} total · {data.view.filter((e) => e.status === "Active").length} active
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Employee</button>
      </div>

      <div className="stat-grid">
        {data.stats.map((stat) => (
          <div className="stat-card" key={stat.label} style={{ borderTop: `3px solid ${stat.color}` }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value" style={{ color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Add Employee Modal */}
      {showForm ? (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              Add New Employee
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <fetcher.Form method="post">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={labelStyle}>Full Name *</label>
                  <input name="name" placeholder="e.g. Arjun Mehta" style={inputStyle} required />
                </div>
                <div>
                  <label style={labelStyle}>Role *</label>
                  <input name="role" placeholder="e.g. Senior Engineer" style={inputStyle} required />
                </div>
                <div>
                  <label style={labelStyle}>Department</label>
                  <select name="department" style={inputStyle}>
                    {departments.filter((d) => d !== "All").map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Location</label>
                  <input name="location" placeholder="e.g. Bengaluru" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Joined On</label>
                  <input name="joinedOn" type="date" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Salary (CTC)</label>
                  <input name="salary" placeholder="e.g. INR 18L" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select name="status" style={inputStyle}>
                    {statuses.filter((s) => s !== "All").map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" type="submit" disabled={fetcher.state !== "idle"}>
                  {fetcher.state !== "idle" ? "Saving…" : "Save Employee"}
                </button>
                <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </fetcher.Form>
          </div>
        </div>
      ) : null}

      {/* Department chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {departments.map((dept) => (
          <button
            key={dept}
            onClick={() => setDepartment(dept)}
            style={{
              padding: "5px 12px", borderRadius: 20, border: "1.5px solid",
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.12s",
              background: department === dept ? "var(--accent)" : "white",
              color: department === dept ? "white" : "var(--ink-3)",
              borderColor: department === dept ? "var(--accent)" : "var(--border)",
            }}
          >
            {dept}{dept !== "All" && deptCounts[dept] ? ` · ${deptCounts[dept]}` : ""}
          </button>
        ))}
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: 200 }}>
            <span className="search-icon">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or role…"
              style={{ width: "100%", padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "1px solid", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.12s",
                  background: status === s ? "var(--surface)" : "white",
                  color: status === s ? "var(--ink)" : "var(--ink-3)",
                  borderColor: status === s ? "var(--ink-2)" : "var(--border)",
                }}
              >{s}</button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">No employees found</div>
            <div className="empty-state-sub">Try adjusting your search or filters</div>
          </div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th><th>Department</th><th>Location</th>
                  <th>Joined</th><th>Salary</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="avatar-sm" style={{ background: avatarColor(emp.name) }}>
                          {getInitials(emp.name)}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--ink)" }}>{emp.name}</div>
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{emp.id} · {emp.role}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "var(--surface)", color: "var(--ink-2)" }}>
                        {emp.department}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 11 }}>📍</span>{emp.location}
                      </span>
                    </td>
                    <td>{emp.joinedLabel}</td>
                    <td style={{ fontWeight: 700, color: "var(--ink)" }}>{emp.salary}</td>
                    <td>
                      <span className={`badge ${emp.status === "Active" ? "badge-green" : emp.status === "Onboarding" ? "badge-blue" : "badge-amber"}`}>
                        {emp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--ink-3)" }}>
              Showing {filtered.length} of {data.view.length} employees
            </div>
          </>
        )}
      </div>
    </HRMSLayout>
  );
}

const labelStyle: CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 5 };
const inputStyle: CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", color: "var(--ink)" };
