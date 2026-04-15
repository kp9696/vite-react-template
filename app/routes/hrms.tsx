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
  const tenantId = currentUser.companyId ?? undefined;
  const dashboard = await getDashboardData(context.cloudflare.env.HRMS, tenantId);

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

      {/* ── Company Plan / Employee Usage Card ──────────────────────── */}
      {company ? (
        <div
          className={`mb-6 rounded-xl bg-white p-4 shadow flex flex-wrap items-center gap-5 border ${
            atLimit ? "border-red-200 bg-red-50" : "border-slate-200"
          }`}
        >
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-slate-800">{company.company_name}</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  company.plan === "free"
                    ? "bg-slate-100 text-slate-600"
                    : company.plan === "pro"
                    ? "bg-violet-100 text-violet-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {company.plan}
              </span>
            </div>

            <div className="text-xs font-semibold text-slate-700 mb-1">Employee Usage</div>
            <div className="flex items-center gap-3">
              <div className="w-40 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    atLimit ? "bg-orange-500" : usagePct > 70 ? "bg-amber-500" : "bg-indigo-500"
                  }`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <span
                className={`text-xs font-semibold ${
                  atLimit ? "text-orange-600" : "text-slate-600"
                }`}
              >
                {usedCount} / {limitCount} employees used
              </span>
            </div>

            {atLimit && (
              <p className="text-red-500 text-sm mt-2">You have reached your employee limit</p>
            )}
          </div>

          {atLimit ? (
            <a
              href="mailto:info@jwithkp.com?subject=Upgrade HRMS Plan"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold text-xs no-underline"
            >
              Upgrade Plan
            </a>
          ) : (
            <Link
              to="/hrms/employees"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold text-xs no-underline"
            >
              Manage Employees
            </Link>
          )}
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

