import { useEffect, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.recruitment";
import HRMSLayout from "../components/HRMSLayout";
import { DEMO_USER } from "../lib/hrms.server";
import { requireSignedInUser } from "../lib/session.server";
import { createJobOpening, getDemoRecruitmentDashboard, getRecruitmentDashboard } from "../lib/workforce.server";

type ActionResult = { ok: boolean; message: string; type: "success" | "error" };

export function meta() {
  return [{ title: "JWithKP HRMS - Recruitment" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  const data = currentUser.id === DEMO_USER.id
    ? getDemoRecruitmentDashboard()
    : currentUser.orgId
      ? await getRecruitmentDashboard(context.cloudflare.env.HRMS, currentUser.orgId)
      : getDemoRecruitmentDashboard();

  return { currentUser, ...data };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  if (currentUser.id === DEMO_USER.id) {
    return { ok: false, type: "error", message: "Demo recruitment data is read-only." };
  }
  if (!currentUser.orgId) {
    return { ok: false, type: "error", message: "Organization not found for this user." };
  }

  const formData = await request.formData();
  await createJobOpening(context.cloudflare.env.HRMS, {
    orgId: currentUser.orgId,
    title: String(formData.get("title") || "").trim(),
    department: String(formData.get("department") || "").trim(),
    location: String(formData.get("location") || "").trim(),
    priority: String(formData.get("priority") || "Normal").trim(),
  });

  return { ok: true, type: "success", message: "Job opening posted successfully." };
}

export default function Recruitment() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<ActionResult | null>(null);

  useEffect(() => {
    if (fetcher.data) {
      setToast(fetcher.data);
      if (fetcher.data.ok) setShowForm(false);
    }
  }, [fetcher.data]);

  return (
    <HRMSLayout currentUser={data.currentUser}>
      {toast ? <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "success" ? "var(--green)" : "var(--red)", color: "white", padding: "12px 20px", borderRadius: 10, fontSize: 13 }}>{toast.message}</div> : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Recruitment</div>
          <div className="page-sub">Track candidates across your hiring pipeline.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Post New Role</button>
      </div>

      {showForm ? (
        <fetcher.Form method="post" className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Post New Role</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input name="title" placeholder="Role title" style={fieldStyle} />
            <input name="department" placeholder="Department" style={fieldStyle} />
            <input name="location" placeholder="Location" style={fieldStyle} />
            <select name="priority" style={fieldStyle}>
              <option>Normal</option>
              <option>Urgent</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={fetcher.state !== "idle"}>{fetcher.state !== "idle" ? "Posting..." : "Post Role"}</button>
            <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </fetcher.Form>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {data.pipeline.map((column) => (
          <div key={column.stage}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: column.color }} />
              <div style={{ fontWeight: 700, fontSize: 13 }}>{column.stage}</div>
              <div style={{ marginLeft: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>{column.count}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {column.roles.map((role) => (
                <div key={role.id} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 14, borderTop: `3px solid ${column.color}` }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 2 }}>{role.title}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 10 }}>{role.department} · {role.location}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Applicants</div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{role.applicants}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Open Positions</div>
        <table className="table">
          <thead><tr><th>Role</th><th>Department</th><th>Location</th><th>Applicants</th><th>Priority</th><th>Stage</th></tr></thead>
          <tbody>
            {data.openings.map((opening) => (
              <tr key={opening.id}>
                <td style={{ fontWeight: 600, color: "var(--ink)" }}>{opening.title}</td>
                <td>{opening.department}</td>
                <td>{opening.location}</td>
                <td><span style={{ fontWeight: 700 }}>{opening.applicantCount}</span> applied</td>
                <td><span className={`badge ${opening.priority === "Urgent" ? "badge-red" : "badge-green"}`}>{opening.priority}</span></td>
                <td>{opening.stage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HRMSLayout>
  );
}

const fieldStyle: CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" };
