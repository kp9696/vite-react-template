import { useState } from "react";
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/hrms.offer-letters";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { isAdminRole } from "../lib/hrms.shared";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";

export function meta() {
  return [{ title: "JWithKP HRMS - Offer Letters" }];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OfferLetter {
  id: string;
  company_id: string;
  candidate_name: string;
  candidate_email: string;
  position: string;
  department: string | null;
  start_date: string | null;
  annual_ctc: number | null;
  reporting_manager: string | null;
  probation_days: number;
  work_location: string | null;
  expires_at: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "withdrawn";
  letter_body: string;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface LoaderData {
  currentUser: { id: string; name: string; role: string; email: string; companyId?: string | null };
  isAdmin: boolean;
  offerLetters: OfferLetter[];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs): Promise<LoaderData> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const isAdmin = isAdminRole(currentUser.role);
  const res = await callCoreHrmsApi<{ offerLetters: OfferLetter[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/offer-letters",
  });
  return {
    currentUser,
    isAdmin,
    offerLetters: res?.offerLetters ?? [],
  };
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const fd = await request.formData();
  const intent = fd.get("intent") as string;

  if (intent === "create") {
    const body = {
      candidateName: fd.get("candidateName"),
      candidateEmail: fd.get("candidateEmail"),
      position: fd.get("position"),
      department: fd.get("department") || null,
      startDate: fd.get("startDate") || null,
      annualCtc: fd.get("annualCtc") ? Number(fd.get("annualCtc")) : null,
      reportingManager: fd.get("reportingManager") || null,
      probationDays: fd.get("probationDays") ? Number(fd.get("probationDays")) : 90,
      workLocation: fd.get("workLocation") || null,
      expiresAt: fd.get("expiresAt") || null,
    };
    await callCoreHrmsApi({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/offer-letters",
      method: "POST",
      body,
    });
    return { ok: true };
  }

  if (intent === "update-status") {
    const id = fd.get("id") as string;
    const action = fd.get("action") as string;
    await callCoreHrmsApi({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/offer-letters/${id}`,
      method: "PATCH",
      body: { action },
    });
    return { ok: true };
  }

  if (intent === "update-letter-body") {
    const id = fd.get("id") as string;
    const letterBody = fd.get("letterBody") as string;
    await callCoreHrmsApi({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/offer-letters/${id}`,
      method: "PATCH",
      body: { letterBody },
    });
    return { ok: true };
  }

  if (intent === "delete") {
    const id = fd.get("id") as string;
    await callCoreHrmsApi({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/offer-letters/${id}`,
      method: "DELETE",
    });
    return { ok: true };
  }

  return { ok: false, error: "Unknown intent" };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  sent:      "bg-blue-100 text-blue-700",
  accepted:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  withdrawn: "bg-yellow-100 text-yellow-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLE[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtCtc(v: number | null) {
  if (v == null) return "—";
  return `₹${v.toLocaleString("en-IN")}`;
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
  const lbl = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Generate Offer Letter</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <fetcher.Form method="post" onSubmit={() => setTimeout(onClose, 400)}>
          <input type="hidden" name="intent" value="create" />
          <div className="p-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={lbl}>Candidate Name *</label>
              <input name="candidateName" required className={inp} placeholder="e.g. Priya Sharma" />
            </div>
            <div>
              <label className={lbl}>Candidate Email *</label>
              <input name="candidateEmail" type="email" required className={inp} placeholder="priya@example.com" />
            </div>
            <div>
              <label className={lbl}>Position / Role *</label>
              <input name="position" required className={inp} placeholder="e.g. Senior Software Engineer" />
            </div>
            <div>
              <label className={lbl}>Department</label>
              <input name="department" className={inp} placeholder="e.g. Engineering" />
            </div>
            <div>
              <label className={lbl}>Start Date</label>
              <input name="startDate" type="date" className={inp} />
            </div>
            <div>
              <label className={lbl}>Annual CTC (₹)</label>
              <input name="annualCtc" type="number" min="0" step="1000" className={inp} placeholder="e.g. 1200000" />
            </div>
            <div>
              <label className={lbl}>Reporting Manager</label>
              <input name="reportingManager" className={inp} placeholder="e.g. Rajesh Kumar" />
            </div>
            <div>
              <label className={lbl}>Work Location</label>
              <input name="workLocation" className={inp} placeholder="e.g. Bangalore / Remote" />
            </div>
            <div>
              <label className={lbl}>Probation Period (days)</label>
              <input name="probationDays" type="number" min="0" defaultValue="90" className={inp} />
            </div>
            <div>
              <label className={lbl}>Offer Expires On</label>
              <input name="expiresAt" type="date" className={inp} />
            </div>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
            >
              {isSubmitting ? "Generating…" : "Generate Letter"}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}

// ─── Letter Preview Modal ─────────────────────────────────────────────────────

function PreviewModal({ letter, isAdmin, onClose }: { letter: OfferLetter; isAdmin: boolean; onClose: () => void }) {
  const fetcher = useFetcher();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(letter.letter_body);

  function handlePrint() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>Offer Letter - ${letter.candidate_name}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;white-space:pre-wrap;line-height:1.6;font-size:14px;}</style>
      </head><body>${body}</body></html>`);
    win.document.close();
    win.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">{letter.candidate_name}</h2>
            <p className="text-xs text-gray-500">{letter.position}{letter.department ? ` · ${letter.department}` : ""} · <StatusBadge status={letter.status} /></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {editing ? (
            <textarea
              className="w-full h-96 border border-indigo-300 rounded-lg p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-6 border border-gray-200">
              {body}
            </pre>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
          <div className="flex gap-2">
            <button onClick={handlePrint} className="px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600">
              🖨 Print / Save PDF
            </button>
            {isAdmin && !editing && letter.status === "draft" && (
              <button onClick={() => setEditing(true)} className="px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600">
                ✏️ Edit Letter
              </button>
            )}
            {editing && (
              <>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="update-letter-body" />
                  <input type="hidden" name="id" value={letter.id} />
                  <input type="hidden" name="letterBody" value={body} />
                  <button type="submit" className="px-3 py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    Save
                  </button>
                </fetcher.Form>
                <button onClick={() => setEditing(false)} className="px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600">
                  Cancel
                </button>
              </>
            )}
          </div>

          <div className="flex gap-2">
            {isAdmin && letter.status === "draft" && (
              <fetcher.Form method="post" onSubmit={onClose}>
                <input type="hidden" name="intent" value="update-status" />
                <input type="hidden" name="id" value={letter.id} />
                <input type="hidden" name="action" value="send" />
                <button type="submit" className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                  📤 Send Offer
                </button>
              </fetcher.Form>
            )}
            {isAdmin && letter.status === "sent" && (
              <fetcher.Form method="post" onSubmit={onClose}>
                <input type="hidden" name="intent" value="update-status" />
                <input type="hidden" name="id" value={letter.id} />
                <input type="hidden" name="action" value="withdraw" />
                <button type="submit" className="px-4 py-2 text-xs bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-medium">
                  Withdraw
                </button>
              </fetcher.Form>
            )}
            {!isAdmin && letter.status === "sent" && (
              <>
                <fetcher.Form method="post" onSubmit={onClose}>
                  <input type="hidden" name="intent" value="update-status" />
                  <input type="hidden" name="id" value={letter.id} />
                  <input type="hidden" name="action" value="accept" />
                  <button type="submit" className="px-4 py-2 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                    ✓ Accept Offer
                  </button>
                </fetcher.Form>
                <fetcher.Form method="post" onSubmit={onClose}>
                  <input type="hidden" name="intent" value="update-status" />
                  <input type="hidden" name="id" value={letter.id} />
                  <input type="hidden" name="action" value="reject" />
                  <button type="submit" className="px-4 py-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
                    Decline
                  </button>
                </fetcher.Form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OfferLettersPage() {
  const { currentUser, isAdmin, offerLetters } = useLoaderData<LoaderData>();
  const [showCreate, setShowCreate] = useState(false);
  const [preview, setPreview] = useState<OfferLetter | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const deleteFetcher = useFetcher();

  const statusFilter = searchParams.get("status") ?? "all";
  const filtered = offerLetters.filter(l => statusFilter === "all" || l.status === statusFilter);

  const counts = offerLetters.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  function confirmDelete(id: string, name: string) {
    if (window.confirm(`Delete offer letter for ${name}? This cannot be undone.`)) {
      const fd = new FormData();
      fd.set("intent", "delete");
      fd.set("id", id);
      deleteFetcher.submit(fd, { method: "post" });
    }
  }

  const filterBtn = (val: string, label: string) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
      statusFilter === val
        ? "bg-indigo-600 text-white border-indigo-600"
        : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
    }`;

  return (
    <HRMSLayout currentUser={currentUser}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Offer Letters</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isAdmin ? "Generate, send and track candidate offer letters." : "View your offer letters."}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-sm"
            >
              <span className="text-base leading-none">+</span> New Offer Letter
            </button>
          )}
        </div>

        {/* Stats row */}
        {isAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(["draft", "sent", "accepted", "rejected", "withdrawn"] as const).map(s => (
              <div key={s} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <div className="text-2xl font-bold text-gray-800">{counts[s] ?? 0}</div>
                <div className="text-xs text-gray-500 capitalize mt-1">{s}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { val: "all", label: `All (${offerLetters.length})` },
            { val: "draft", label: "Draft" },
            { val: "sent", label: "Sent" },
            { val: "accepted", label: "Accepted" },
            { val: "rejected", label: "Rejected" },
            { val: "withdrawn", label: "Withdrawn" },
          ].map(({ val, label }) => (
            <button key={val} className={filterBtn(val, label)} onClick={() => setSearchParams(val === "all" ? {} : { status: val })}>
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-gray-500 text-sm">
              {statusFilter === "all"
                ? isAdmin
                  ? "No offer letters yet. Click \"New Offer Letter\" to generate one."
                  : "No offer letters addressed to your account yet."
                : `No ${statusFilter} offer letters.`}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Candidate</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Position</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">CTC</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Start Date</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Expires</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{l.candidate_name}</div>
                        <div className="text-xs text-gray-400">{l.candidate_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700">{l.position}</div>
                        {l.department && <div className="text-xs text-gray-400">{l.department}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{fmtCtc(l.annual_ctc)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(l.start_date)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(l.expires_at)}</td>
                      <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(l.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setPreview(l)}
                            className="px-3 py-1 text-xs border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                          >
                            View
                          </button>
                          {isAdmin && (l.status === "draft" || l.status === "withdrawn") && (
                            <button
                              onClick={() => confirmDelete(l.id, l.candidate_name)}
                              className="px-3 py-1 text-xs border border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
      {preview && <PreviewModal letter={preview} isAdmin={isAdmin} onClose={() => setPreview(null)} />}
    </HRMSLayout>
  );
}
