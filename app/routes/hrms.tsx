import HRMSLayout from "../components/HRMSLayout";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms";
import { getDashboardData } from "../lib/hrms.server";
import { isAdminRole } from "../lib/hrms.shared";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { getCompanyByOwnerId, getSaasEmployeeCount } from "../lib/company.server";

const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9"];

export function meta() {
  return [{ title: "JWithKP HRMS - Dashboard" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const dashboard = await getDashboardData(context.cloudflare.env.HRMS, currentUser.orgId ?? undefined);

  // SaaS company info
  let company = null;
  let saasEmployeeCount = 0;
  if (currentUser.email) {
    company = await getCompanyByOwnerId(context.cloudflare.env.HRMS, currentUser.email);
    if (company) {
      saasEmployeeCount = await getSaasEmployeeCount(context.cloudflare.env.HRMS, company.id);
    }
  }

  return { currentUser, ...dashboard, company, saasEmployeeCount };
}

export default function HRMSDashboard() {
  const data = useLoaderData<typeof loader>();
  const { company, saasEmployeeCount } = data;
  const usedCount = saasEmployeeCount ?? 0;
  const limitCount = company?.employee_limit ?? 5;
  const atLimit = usedCount >= limitCount;
  const usagePct = company ? Math.min(100, Math.round((usedCount / limitCount) * 100)) : 0;

  return (
    <HRMSLayout currentUser={data.currentUser}>
      <div className="page-title">Welcome, {data.currentUser.name}</div>
      <div className="page-sub">
        {data.organization?.name
          ? `${data.organization.name} workspace · ${isAdminRole(data.currentUser.role) ? "Admin" : "Employee"} access`
          : "Your dashboard is powered by live D1 data from Cloudflare."}
      </div>

      {/* ── Company Plan Banner ──────────────────────────────────────── */}
      {company ? (
        <div style={{
          background: atLimit ? "#fff7ed" : "linear-gradient(135deg,#f8fafc 0%,#eef2ff 100%)",
          border: `1.5px solid ${atLimit ? "#fed7aa" : "#e0e7ff"}`,
          borderRadius: 12,
          padding: "14px 20px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                {company.company_name}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                textTransform: "uppercase" as const, letterSpacing: "0.5px",
                background: company.plan === "free" ? "#f1f5f9" : company.plan === "pro" ? "#ede9fe" : "#dcfce7",
                color: company.plan === "free" ? "#64748b" : company.plan === "pro" ? "#7c3aed" : "#15803d",
              }}>
                {company.plan}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 160, height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  width: `${usagePct}%`, height: "100%", borderRadius: 99,
                  background: atLimit ? "#f97316" : usagePct > 70 ? "#f59e0b" : "#6366f1",
                  transition: "width 0.4s ease",
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: atLimit ? "#ea580c" : "var(--ink-2)" }}>
                {usedCount} / {limitCount} employees
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {atLimit ? (
              <a
                href="mailto:info@jwithkp.com?subject=Upgrade HRMS Plan"
                style={{
                  padding: "7px 16px",
                  background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color: "white", borderRadius: 8, textDecoration: "none",
                  fontSize: 12, fontWeight: 700,
                }}
              >
                Upgrade Plan
              </a>
            ) : (
              <Link
                to="/hrms/employees"
                style={{
                  padding: "7px 16px",
                  background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color: "white", borderRadius: 8, textDecoration: "none",
                  fontSize: 12, fontWeight: 700,
                }}
              >
                Manage Employees
              </Link>
            )}
          </div>
        </div>
      ) : null}

      <div className="stat-grid">
        {data.stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
            <div className={`stat-delta ${stat.tone === "warning" ? "delta-down" : stat.tone === "positive" ? "delta-up" : ""}`}>
              {stat.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="two-col">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Team Snapshot</div>
            {isAdminRole(data.currentUser.role) ? (
              <Link to="/hrms/users" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>Manage users →</Link>
            ) : null}
          </div>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Joined</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.recentUsers.length === 0 ? (
                <tr><td colSpan={4} style={{ color: "var(--ink-3)" }}>No users found in D1 yet.</td></tr>
              ) : (
                data.recentUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{user.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{user.department}</div>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.joinedOn}</td>
                    <td><span className={`badge ${user.status === "Active" ? "badge-green" : "badge-amber"}`}>{user.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Pending Invite Activity</div>
            <span className="badge badge-red">{data.pendingInvites.length} pending</span>
          </div>
          {data.pendingInvites.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>There are no outstanding invites right now.</div>
          ) : (
            data.pendingInvites.map((invite) => (
              <div key={invite.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{invite.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{invite.role} · {invite.department}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{invite.detail}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Workforce by Department</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.departmentData.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Department breakdown will appear once users are added.</div>
          ) : (
            data.departmentData.map((item, index) => (
              <div key={item.department} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 140, fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>{item.department}</div>
                <div style={{ flex: 1, background: "var(--surface)", borderRadius: 99, height: 10, overflow: "hidden" }}>
                  <div style={{ width: `${item.percent}%`, background: colors[index % colors.length], height: "100%", borderRadius: 99 }} />
                </div>
                <div style={{ width: 60, fontSize: 13, fontWeight: 700, color: "var(--ink)", textAlign: "right" }}>{item.count}</div>
                <div style={{ width: 44, fontSize: 12, color: "var(--ink-3)" }}>{item.percent}%</div>
              </div>
            ))
          )}
        </div>
      </div>
    </HRMSLayout>
  );
}

