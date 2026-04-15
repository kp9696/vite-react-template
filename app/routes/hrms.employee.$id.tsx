import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.employee.$id";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import {
  addEmployeeCustomFieldByOrg,
  addEmployeeDocumentByOrg,
  addEmployeeWorkHistoryByOrg,
  deleteEmployeeCustomFieldByOrg,
  deleteEmployeeDocumentByOrg,
  deleteEmployeeWorkHistoryByOrg,
  getEmployeeProfileById,
  listEmployeeCustomFieldsByOrg,
  listEmployeeDocumentsByOrg,
  listEmployeeWorkHistoryByOrg,
  updateEmployeeProfileById,
} from "../lib/workforce.server";

type ActionResult = { ok: boolean; type: "success" | "error"; message: string };

type TabKey =
  | "Personal Info"
  | "Employment"
  | "Bank Details"
  | "Documents"
  | "Work History"
  | "Profile Photo"
  | "Custom Fields";

const TABS: TabKey[] = [
  "Personal Info",
  "Employment",
  "Bank Details",
  "Documents",
  "Work History",
  "Profile Photo",
  "Custom Fields",
];

export function meta() {
  return [{ title: "JWithKP HRMS - Employee Profile" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  if (!tenantId) {
    throw new Response("Organization not found", { status: 403 });
  }

  const employeeId = params.id;
  const db = context.cloudflare.env.HRMS;
  const employee = await getEmployeeProfileById(db, tenantId, employeeId);
  if (!employee) {
    throw new Response("Employee not found", { status: 404 });
  }

  const [workHistory, customFields, documents] = await Promise.all([
    listEmployeeWorkHistoryByOrg(db, tenantId, employeeId),
    listEmployeeCustomFieldsByOrg(db, tenantId, employeeId),
    listEmployeeDocumentsByOrg(db, tenantId, employeeId),
  ]);

  return { currentUser, employee, workHistory, customFields, documents };
}

function toBase64DataUrl(file: File, bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);
  const mime = file.type || "application/octet-stream";
  return `data:${mime};base64,${base64}`;
}

export async function action({ request, context, params }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  if (!tenantId) {
    return { ok: false, type: "error", message: "Organization not found." };
  }

  const employeeId = params.id;
  const db = context.cloudflare.env.HRMS;
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "update-personal") {
    await updateEmployeeProfileById(db, tenantId, employeeId, {
      name: String(formData.get("name") || ""),
      dob: String(formData.get("dob") || ""),
      gender: String(formData.get("gender") || ""),
      address: String(formData.get("address") || ""),
      emergencyContact: String(formData.get("emergencyContact") || ""),
      idProof: String(formData.get("idProof") || ""),
    });
    return { ok: true, type: "success", message: "Personal info updated." };
  }

  if (intent === "update-employment") {
    await updateEmployeeProfileById(db, tenantId, employeeId, {
      designation: String(formData.get("designation") || ""),
      grade: String(formData.get("grade") || ""),
      reportingManager: String(formData.get("reportingManager") || ""),
      costCenter: String(formData.get("costCenter") || ""),
    });
    return { ok: true, type: "success", message: "Employment details updated." };
  }

  if (intent === "update-bank") {
    await updateEmployeeProfileById(db, tenantId, employeeId, {
      accountHolder: String(formData.get("accountHolder") || ""),
      bankName: String(formData.get("bankName") || ""),
      accountNumber: String(formData.get("accountNumber") || ""),
      ifsc: String(formData.get("ifsc") || ""),
      branch: String(formData.get("branch") || ""),
    });
    return { ok: true, type: "success", message: "Bank details updated." };
  }

  if (intent === "add-work-history") {
    await addEmployeeWorkHistoryByOrg(db, tenantId, employeeId, {
      company: String(formData.get("company") || ""),
      role: String(formData.get("role") || ""),
      duration: String(formData.get("duration") || ""),
      description: String(formData.get("description") || ""),
    });
    return { ok: true, type: "success", message: "Work history added." };
  }

  if (intent === "delete-work-history") {
    const workHistoryId = String(formData.get("workHistoryId") || "");
    if (!workHistoryId) {
      return { ok: false, type: "error", message: "Work history item not found." };
    }
    await deleteEmployeeWorkHistoryByOrg(db, tenantId, employeeId, workHistoryId);
    return { ok: true, type: "success", message: "Work history deleted." };
  }

  if (intent === "add-custom-field") {
    await addEmployeeCustomFieldByOrg(db, tenantId, employeeId, {
      fieldName: String(formData.get("customFieldName") || ""),
      fieldValue: String(formData.get("customFieldValue") || ""),
    });
    return { ok: true, type: "success", message: "Custom field added." };
  }

  if (intent === "delete-custom-field") {
    const customFieldId = String(formData.get("customFieldId") || "");
    if (!customFieldId) {
      return { ok: false, type: "error", message: "Custom field not found." };
    }
    await deleteEmployeeCustomFieldByOrg(db, tenantId, employeeId, customFieldId);
    return { ok: true, type: "success", message: "Custom field deleted." };
  }

  if (intent === "upload-document") {
    const docType = String(formData.get("docType") || "Other");
    const file = formData.get("documentFile");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, type: "error", message: "Please choose a document file." };
    }
    if (file.size > 3 * 1024 * 1024) {
      return { ok: false, type: "error", message: "Document must be <= 3 MB." };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const dataUrl = toBase64DataUrl(file, bytes);

    await addEmployeeDocumentByOrg(db, tenantId, employeeId, {
      docType,
      fileName: file.name,
      fileUrl: dataUrl,
    });
    return { ok: true, type: "success", message: "Document uploaded." };
  }

  if (intent === "delete-document") {
    const documentId = String(formData.get("documentId") || "");
    if (!documentId) {
      return { ok: false, type: "error", message: "Document not found." };
    }
    await deleteEmployeeDocumentByOrg(db, tenantId, employeeId, documentId);
    return { ok: true, type: "success", message: "Document deleted." };
  }

  if (intent === "upload-photo") {
    const file = formData.get("profilePhoto");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, type: "error", message: "Please choose a photo." };
    }
    if (!file.type.startsWith("image/")) {
      return { ok: false, type: "error", message: "Profile photo must be an image." };
    }
    if (file.size > 2 * 1024 * 1024) {
      return { ok: false, type: "error", message: "Photo must be <= 2 MB." };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const photoUrl = toBase64DataUrl(file, bytes);

    await updateEmployeeProfileById(db, tenantId, employeeId, { profilePhotoUrl: photoUrl });
    return { ok: true, type: "success", message: "Profile photo updated." };
  }

  return { ok: false, type: "error", message: "Unsupported action." };
}

const formStyle: React.CSSProperties = { maxWidth: 560, display: "flex", flexDirection: "column", gap: 14 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 };

export default function EmployeeProfile() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const [tab, setTab] = useState<TabKey>("Personal Info");
  const [toast, setToast] = useState<ActionResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!fetcher.data) return;
    setToast(fetcher.data);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 3200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetcher.data]);

  const { employee, currentUser, workHistory, customFields, documents } = data;

  return (
    <HRMSLayout currentUser={currentUser}>
      {toast ? (
        <div className={`toast toast-${toast.type}`} style={{ cursor: "pointer" }} onClick={() => setToast(null)}>
          <span>{toast.type === "success" ? "✓" : "✕"}</span>
          {toast.message}
        </div>
      ) : null}

      <div className="panel" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src={employee.profilePhotoUrl || "https://placehold.co/80x80"}
            alt="Employee"
            style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)" }}
          />
          <div>
            <h2 style={{ margin: 0 }}>{employee.name}</h2>
            <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
              {employee.id} • {employee.role} • {employee.department}
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16, paddingBottom: 10, overflowX: "auto", whiteSpace: "nowrap" }}>
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            style={{
              marginRight: 10,
              marginBottom: 8,
              border: "none",
              background: tab === name ? "var(--ink)" : "var(--surface)",
              color: tab === name ? "white" : "var(--ink)",
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="panel">
        {tab === "Personal Info" && (
          <fetcher.Form method="post" style={formStyle}>
            <input type="hidden" name="intent" value="update-personal" />
            <label>Full Name<input style={inputStyle} type="text" name="name" defaultValue={employee.name} required /></label>
            <label>Date of Birth<input style={inputStyle} type="date" name="dob" defaultValue={employee.dob} /></label>
            <label>
              Gender
              <select style={inputStyle} name="gender" defaultValue={employee.gender}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label>Address<textarea style={inputStyle} name="address" rows={2} defaultValue={employee.address} /></label>
            <label>Emergency Contact<input style={inputStyle} type="text" name="emergencyContact" defaultValue={employee.emergencyContact} /></label>
            <label>PAN / Aadhaar<input style={inputStyle} type="text" name="idProof" defaultValue={employee.idProof} /></label>
            <button type="submit" className="btn btn-primary" disabled={fetcher.state !== "idle"}>Save</button>
          </fetcher.Form>
        )}

        {tab === "Employment" && (
          <fetcher.Form method="post" style={formStyle}>
            <input type="hidden" name="intent" value="update-employment" />
            <label>Designation<input style={inputStyle} type="text" name="designation" defaultValue={employee.designation} /></label>
            <label>Grade<input style={inputStyle} type="text" name="grade" defaultValue={employee.grade} /></label>
            <label>Reporting Manager<input style={inputStyle} type="text" name="reportingManager" defaultValue={employee.reportingManager} /></label>
            <label>Cost Center<input style={inputStyle} type="text" name="costCenter" defaultValue={employee.costCenter} /></label>
            <button type="submit" className="btn btn-primary" disabled={fetcher.state !== "idle"}>Save</button>
          </fetcher.Form>
        )}

        {tab === "Bank Details" && (
          <fetcher.Form method="post" style={formStyle}>
            <input type="hidden" name="intent" value="update-bank" />
            <label>Account Holder Name<input style={inputStyle} type="text" name="accountHolder" defaultValue={employee.accountHolder} /></label>
            <label>Bank Name<input style={inputStyle} type="text" name="bankName" defaultValue={employee.bankName} /></label>
            <label>Account Number<input style={inputStyle} type="text" name="accountNumber" defaultValue={employee.accountNumber} /></label>
            <label>IFSC<input style={inputStyle} type="text" name="ifsc" defaultValue={employee.ifsc} /></label>
            <label>Branch<input style={inputStyle} type="text" name="branch" defaultValue={employee.branch} /></label>
            <button type="submit" className="btn btn-primary" disabled={fetcher.state !== "idle"}>Save</button>
          </fetcher.Form>
        )}

        {tab === "Documents" && (
          <div>
            <fetcher.Form method="post" encType="multipart/form-data" style={formStyle}>
              <input type="hidden" name="intent" value="upload-document" />
              <label>
                Document Type
                <select style={inputStyle} name="docType" defaultValue="Offer Letter">
                  <option value="Offer Letter">Offer Letter</option>
                  <option value="ID Proof">ID Proof</option>
                  <option value="Contract">Contract</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label>File<input style={inputStyle} type="file" name="documentFile" required /></label>
              <button type="submit" className="btn btn-primary" disabled={fetcher.state !== "idle"}>Upload</button>
            </fetcher.Form>

            <div style={{ marginTop: 18 }}>
              <h4 style={{ marginBottom: 10 }}>Uploaded Documents</h4>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {documents.length === 0 ? <li>No documents uploaded.</li> : null}
                {documents.map((doc) => (
                  <li key={doc.id} style={{ marginBottom: 8 }}>
                    <strong>{doc.docType}:</strong>{" "}
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">{doc.fileName}</a>
                    <fetcher.Form method="post" style={{ display: "inline", marginLeft: 8 }}>
                      <input type="hidden" name="intent" value="delete-document" />
                      <input type="hidden" name="documentId" value={doc.id} />
                      <button type="submit" className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} disabled={fetcher.state !== "idle"}>
                        Delete
                      </button>
                    </fetcher.Form>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {tab === "Work History" && (
          <div>
            <h4 style={{ marginTop: 0, marginBottom: 10 }}>Experience Timeline</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {workHistory.length === 0 ? <li style={{ color: "var(--ink-3)" }}>No work history yet.</li> : null}
              {workHistory.map((item) => (
                <li key={item.id} style={{ marginBottom: 12, borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
                  <div style={{ fontWeight: 700 }}>{item.role} at {item.company}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{item.duration}</div>
                  <div style={{ fontSize: 13 }}>{item.description}</div>
                  <fetcher.Form method="post" style={{ marginTop: 6 }}>
                    <input type="hidden" name="intent" value="delete-work-history" />
                    <input type="hidden" name="workHistoryId" value={item.id} />
                    <button type="submit" className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} disabled={fetcher.state !== "idle"}>
                      Delete
                    </button>
                  </fetcher.Form>
                </li>
              ))}
            </ul>

            <fetcher.Form method="post" style={{ ...formStyle, marginTop: 14 }}>
              <input type="hidden" name="intent" value="add-work-history" />
              <label>Company<input style={inputStyle} type="text" name="company" required /></label>
              <label>Role<input style={inputStyle} type="text" name="role" required /></label>
              <label>Duration<input style={inputStyle} type="text" name="duration" placeholder="Jan 2020 - Mar 2022" required /></label>
              <label>Description<textarea style={inputStyle} name="description" rows={2} /></label>
              <button type="submit" className="btn btn-primary" disabled={fetcher.state !== "idle"}>Add Experience</button>
            </fetcher.Form>
          </div>
        )}

        {tab === "Profile Photo" && (
          <fetcher.Form method="post" encType="multipart/form-data" style={formStyle}>
            <input type="hidden" name="intent" value="upload-photo" />
            <label>Upload Photo<input style={inputStyle} type="file" name="profilePhoto" accept="image/*" required /></label>
            <button type="submit" className="btn btn-primary" disabled={fetcher.state !== "idle"}>Upload Photo</button>
          </fetcher.Form>
        )}

        {tab === "Custom Fields" && (
          <div>
            <ul style={{ listStyle: "none", padding: 0, marginBottom: 16 }}>
              {customFields.length === 0 ? <li style={{ color: "var(--ink-3)" }}>No custom fields yet.</li> : null}
              {customFields.map((field) => (
                <li key={field.id} style={{ marginBottom: 8 }}>
                  <strong>{field.fieldName}:</strong> {field.fieldValue}
                  <fetcher.Form method="post" style={{ display: "inline", marginLeft: 8 }}>
                    <input type="hidden" name="intent" value="delete-custom-field" />
                    <input type="hidden" name="customFieldId" value={field.id} />
                    <button type="submit" className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} disabled={fetcher.state !== "idle"}>
                      Delete
                    </button>
                  </fetcher.Form>
                </li>
              ))}
            </ul>
            <fetcher.Form method="post" style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <input type="hidden" name="intent" value="add-custom-field" />
              <label style={{ flex: 1, minWidth: 200 }}>Field Name<input style={inputStyle} type="text" name="customFieldName" required /></label>
              <label style={{ flex: 1, minWidth: 200 }}>Value<input style={inputStyle} type="text" name="customFieldValue" required /></label>
              <button type="submit" className="btn btn-primary" disabled={fetcher.state !== "idle"}>Add Field</button>
            </fetcher.Form>
          </div>
        )}
      </div>
    </HRMSLayout>
  );
}
