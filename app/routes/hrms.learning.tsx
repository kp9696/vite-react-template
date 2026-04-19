import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/hrms.learning";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { avatarColor, getInitials, isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Course {
  id: string;
  title: string;
  category: string;
  level: string;
  duration: string | null;
  provider: string | null;
  description: string | null;
  is_mandatory: number;
  created_by: string | null;
  created_at: string;
}

interface Enrollment {
  id: string;
  course_id: string;
  user_id: string;
  status: string;       // enrolled | in_progress | completed
  progress: number;     // 0-100
  enrolled_at: string;
  completed_at: string | null;
  updated_at: string;
  // joined from courses:
  title?: string;
  category?: string;
  level?: string;
  duration?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  Management:    "#6366f1",
  Compliance:    "#ef4444",
  Technical:     "#8b5cf6",
  "Soft Skills": "#10b981",
  Culture:       "#f59e0b",
};

const LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  All:           { bg: "#f1f5f9", text: "#64748b" },
  Beginner:      { bg: "#dcfce7", text: "#16a34a" },
  Intermediate:  { bg: "#fef9c3", text: "#854d0e" },
  Advanced:      { bg: "#ede9fe", text: "#7c3aed" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  enrolled:    { bg: "#dbeafe", text: "#1d4ed8" },
  in_progress: { bg: "#fef9c3", text: "#854d0e" },
  completed:   { bg: "#dcfce7", text: "#16a34a" },
};

const CATEGORIES = ["Management", "Compliance", "Technical", "Soft Skills", "Culture"];
const LEVELS     = ["All", "Beginner", "Intermediate", "Advanced"];

// ── Meta + Loader ─────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Learning & Development" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const currentUser = await requireSignedInUser(request, env);

  const [coursesRes, myCoursesRes] = await Promise.all([
    callCoreHrmsApi<{ courses?: Course[] }>({
      request, env, currentUser,
      path: "/api/learning/courses",
    }),
    callCoreHrmsApi<{ enrollments?: Enrollment[] }>({
      request, env, currentUser,
      path: "/api/learning/my-courses",
    }),
  ]);

  return {
    currentUser,
    isAdmin: isAdminRole(currentUser.role),
    courses: coursesRes?.courses ?? [],
    myEnrollments: myCoursesRes?.enrollments ?? [],
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const currentUser = await requireSignedInUser(request, env);
  const fd = await request.formData();
  const intent = fd.get("intent") as string;

  if (intent === "add-course") {
    const title       = (fd.get("title") as string)?.trim();
    const category    = (fd.get("category") as string) || "Technical";
    const level       = (fd.get("level") as string) || "All";
    const duration    = (fd.get("duration") as string) || undefined;
    const provider    = (fd.get("provider") as string) || undefined;
    const description = (fd.get("description") as string) || undefined;
    const isMandatory = fd.get("isMandatory") === "1";

    if (!title) return { error: "Course title is required." };

    const res = await callCoreHrmsApi<{ ok?: boolean; id?: string; error?: string }>({
      request, env, currentUser,
      path: "/api/learning/courses",
      method: "POST",
      body: { title, category, level, duration, provider, description, isMandatory },
    });

    if (res?.error) return { error: res.error };
    return { ok: true, intent };
  }

  if (intent === "enroll") {
    const courseId = fd.get("courseId") as string;
    if (!courseId) return { error: "courseId is required." };

    const res = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request, env, currentUser,
      path: "/api/learning/enroll",
      method: "POST",
      body: { courseId },
    });

    if (res?.error) return { error: res.error };
    return { ok: true, intent, courseId };
  }

  if (intent === "update-progress") {
    const enrollmentId = fd.get("enrollmentId") as string;
    const courseId     = fd.get("courseId") as string;
    const progress     = Number(fd.get("progress"));
    const status       = progress === 100 ? "completed" : progress > 0 ? "in_progress" : "enrolled";

    const res = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request, env, currentUser,
      path: "/api/learning/progress",
      method: "PATCH",
      body: { courseId, progress, status },
    });

    if (res?.error) return { error: res.error };
    return { ok: true, intent, enrollmentId, progress, status };
  }

  return { error: "Unknown intent." };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Learning() {
  const { currentUser, isAdmin, courses: initialCourses, myEnrollments: initialEnrollments } = useLoaderData<typeof loader>();

  const [courses, setCourses]           = useState<Course[]>(initialCourses);
  const [myEnrollments, setMyEnrollments] = useState<Enrollment[]>(initialEnrollments);
  const revalidator = useRevalidator();

  // Sync state when loader revalidates
  useEffect(() => { setCourses(initialCourses); }, [initialCourses]);
  useEffect(() => { setMyEnrollments(initialEnrollments); }, [initialEnrollments]);
  const [toast, setToast]               = useState<string | null>(null);
  const [toastErr, setToastErr]         = useState<string | null>(null);

  // Filters
  const [catFilter, setCatFilter]       = useState("All");
  const [tab, setTab]                   = useState<"all" | "mine">("all");

  // Add course form
  const [showForm, setShowForm]         = useState(false);
  const [title, setTitle]               = useState("");
  const [category, setCategory]         = useState("Technical");
  const [level, setLevel]               = useState("All");
  const [duration, setDuration]         = useState("");
  const [provider, setProvider]         = useState("");
  const [desc, setDesc]                 = useState("");
  const [isMandatory, setIsMandatory]   = useState(false);

  // Progress edit
  const [progressEnrollId, setProgressEnrollId] = useState<string | null>(null);
  const [progressVal, setProgressVal]           = useState(0);

  const courseFetcher   = useFetcher<typeof action>();
  const enrollFetcher   = useFetcher<typeof action>();
  const progressFetcher = useFetcher<typeof action>();

  // ── Toast timers ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!toastErr) return;
    const t = setTimeout(() => setToastErr(null), 5000);
    return () => clearTimeout(t);
  }, [toastErr]);

  // ── Add course result ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!courseFetcher.data) return;
    if ("error" in courseFetcher.data) { setToastErr(courseFetcher.data.error as string); return; }
    if ("ok" in courseFetcher.data) {
      setShowForm(false);
      setTitle(""); setDuration(""); setProvider(""); setDesc(""); setIsMandatory(false);
      setToast(`Course "${title}" added to the library!`);
      revalidator.revalidate();
    }
  }, [courseFetcher.data]);

  // ── Enroll result ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enrollFetcher.data) return;
    if ("error" in enrollFetcher.data) { setToastErr(enrollFetcher.data.error as string); return; }
    if ("ok" in enrollFetcher.data) {
      setToast("Enrolled successfully! Check 'My Courses' tab.");
      revalidator.revalidate();
    }
  }, [enrollFetcher.data]);

  // ── Progress update result ─────────────────────────────────────────────────
  useEffect(() => {
    if (!progressFetcher.data) return;
    if ("error" in progressFetcher.data) { setToastErr(progressFetcher.data.error as string); return; }
    if ("ok" in progressFetcher.data) {
      const d = progressFetcher.data as { enrollmentId: string; progress: number; status: string };
      setProgressEnrollId(null);
      setMyEnrollments(prev => prev.map(e => e.id === d.enrollmentId ? { ...e, progress: d.progress, status: d.status } : e));
      setToast(d.progress === 100 ? "🎉 Course completed!" : "Progress updated!");
    }
  }, [progressFetcher.data]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const enrolledCourseIds = new Set(myEnrollments.map(e => e.course_id));

  const filteredCourses = courses.filter(c =>
    catFilter === "All" || c.category === catFilter,
  );

  const completedCount = myEnrollments.filter(e => e.status === "completed").length;
  const inProgressCount = myEnrollments.filter(e => e.status === "in_progress").length;
  const avgCompletion = myEnrollments.length
    ? Math.round(myEnrollments.reduce((s, e) => s + e.progress, 0) / myEnrollments.length)
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <HRMSLayout currentUser={currentUser}>

      {toast && (
        <div style={toastStyle("#0f172a")}>
          <span style={{ fontSize: 16 }}>✓</span> {toast}
        </div>
      )}
      {toastErr && (
        <div style={toastStyle("#dc2626")}>
          <span style={{ fontSize: 16 }}>✕</span> {toastErr}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Learning & Development</div>
          <div className="page-sub">Upskill your workforce with curated courses and certifications.</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Course</button>
        )}
      </div>

      {/* Add Course Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <div className="card-title">Add New Course</div>
          <courseFetcher.Form method="post">
            <input type="hidden" name="intent" value="add-course" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelSt}>Course Title *</label>
                <input name="title" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Advanced Data Analysis" style={fieldSt} required />
              </div>
              <div>
                <label style={labelSt}>Category</label>
                <select name="category" value={category} onChange={e => setCategory(e.target.value)} style={fieldSt}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Level</label>
                <select name="level" value={level} onChange={e => setLevel(e.target.value)} style={fieldSt}>
                  {LEVELS.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Duration</label>
                <input name="duration" value={duration} onChange={e => setDuration(e.target.value)}
                  placeholder="e.g. 2h 30m" style={fieldSt} />
              </div>
              <div>
                <label style={labelSt}>Provider / Instructor</label>
                <input name="provider" value={provider} onChange={e => setProvider(e.target.value)}
                  placeholder="e.g. Internal — Kiran Sharma" style={fieldSt} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelSt}>Description</label>
                <textarea name="description" value={desc} onChange={e => setDesc(e.target.value)}
                  placeholder="Brief course description…"
                  style={{ ...fieldSt, height: 72, resize: "vertical" as const }} />
              </div>
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" id="mandatory" name="isMandatory" value="1"
                  checked={isMandatory} onChange={e => setIsMandatory(e.target.checked)}
                  style={{ width: 16, height: 16 }} />
                <label htmlFor="mandatory" style={{ fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Mark as Mandatory
                </label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={!title.trim() || courseFetcher.state !== "idle"}>
                {courseFetcher.state !== "idle" ? "Adding…" : "Add Course"}
              </button>
              <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </courseFetcher.Form>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {[
          { label: "Total Courses",    value: courses.length,          sub: `${courses.filter(c => c.is_mandatory).length} mandatory` },
          { label: "My Enrollments",   value: myEnrollments.length,    sub: `${inProgressCount} in progress` },
          { label: "Avg Completion",   value: myEnrollments.length ? `${avgCompletion}%` : "—", sub: "Across my courses" },
          { label: "Completed",        value: completedCount,          sub: "Courses finished" },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--surface)", padding: 4, borderRadius: 10, width: "fit-content", border: "1.5px solid var(--border)" }}>
        {(["all", "mine"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 20px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13, transition: "all 0.15s",
              background: tab === t ? "var(--accent)" : "transparent",
              color: tab === t ? "white" : "var(--ink-3)",
            }}
          >
            {t === "all" ? `Course Library (${courses.length})` : `My Courses (${myEnrollments.length})`}
          </button>
        ))}
      </div>

      {/* ── All Courses Tab ─────────────────────────────────────────────────── */}
      {tab === "all" && (
        <>
          {/* Category filter */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {["All", ...CATEGORIES].map(cat => {
              const color = cat === "All" ? "#64748b" : CAT_COLORS[cat] || "#64748b";
              const active = catFilter === cat;
              return (
                <button key={cat} onClick={() => setCatFilter(cat)} style={{
                  padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${active ? color : "var(--border)"}`,
                  background: active ? `${color}18` : "white",
                  color: active ? color : "var(--ink-3)", cursor: "pointer",
                }}>
                  {cat}
                </button>
              );
            })}
          </div>

          {filteredCourses.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
                {courses.length === 0 ? "No courses yet" : "No courses in this category"}
              </div>
              <div style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 380, margin: "0 auto 24px", lineHeight: 1.6 }}>
                {courses.length === 0
                  ? "Build your organisation's learning library. Add internal or external courses and track completion."
                  : "Try a different category filter."}
              </div>
              {isAdmin && courses.length === 0 && (
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add First Course</button>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {filteredCourses.map(course => {
              const catColor = CAT_COLORS[course.category] || "#64748b";
              const lc = LEVEL_COLORS[course.level] || LEVEL_COLORS.All;
              const enrolled = enrolledCourseIds.has(course.id);
              const enrollment = myEnrollments.find(e => e.course_id === course.id);

              return (
                <div key={course.id} style={{
                  background: "white", borderRadius: 14, border: "1.5px solid var(--border)",
                  padding: "20px", display: "flex", flexDirection: "column", gap: 12,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}>
                  {/* Header row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{
                      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: `${catColor}18`, color: catColor,
                    }}>
                      {course.category}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {course.is_mandatory === 1 && (
                        <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#fee2e2", color: "#dc2626" }}>
                          Mandatory
                        </span>
                      )}
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: lc.bg, color: lc.text }}>
                        {course.level}
                      </span>
                    </div>
                  </div>

                  {/* Title */}
                  <div style={{ fontWeight: 800, fontSize: 15, color: "var(--ink)", lineHeight: 1.3 }}>{course.title}</div>

                  {/* Meta */}
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--ink-3)" }}>
                    {course.duration && <span>⏱ {course.duration}</span>}
                    {course.provider && <span>👤 {course.provider}</span>}
                  </div>

                  {/* Description */}
                  {course.description && (
                    <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {course.description}
                    </div>
                  )}

                  {/* Progress (if enrolled) */}
                  {enrollment && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>
                        <span style={{ ...STATUS_COLORS[enrollment.status] && {}, padding: "1px 8px", borderRadius: 20, fontWeight: 700, background: STATUS_COLORS[enrollment.status]?.bg, color: STATUS_COLORS[enrollment.status]?.text }}>
                          {enrollment.status.replace("_", " ")}
                        </span>
                        <span>{enrollment.progress}%</span>
                      </div>
                      <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${enrollment.progress}%`, background: "var(--accent)", borderRadius: 3 }} />
                      </div>
                    </div>
                  )}

                  {/* Action */}
                  {enrolled ? (
                    <button className="btn btn-outline" style={{ fontSize: 12, marginTop: "auto" }}
                      onClick={() => { setProgressEnrollId(enrollment!.id); setProgressVal(enrollment!.progress); setTab("mine"); }}
                  >
                      Update Progress
                    </button>
                  ) : (
                    <enrollFetcher.Form method="post" style={{ marginTop: "auto" }}>
                      <input type="hidden" name="intent" value="enroll" />
                      <input type="hidden" name="courseId" value={course.id} />
                      <button className="btn btn-primary" type="submit" style={{ fontSize: 12, width: "100%" }}
                        disabled={enrollFetcher.state !== "idle"}>
                        {enrollFetcher.state !== "idle" ? "Enrolling…" : "Enroll"}
                      </button>
                    </enrollFetcher.Form>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── My Courses Tab ──────────────────────────────────────────────────── */}
      {tab === "mine" && (
        <>
          {myEnrollments.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "50px 20px" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎓</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No enrollments yet</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20 }}>
                Browse the course library and enrol to start learning.
              </div>
              <button className="btn btn-primary" onClick={() => setTab("all")}>Browse Courses</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {myEnrollments.map(enr => {
                const sc = STATUS_COLORS[enr.status] || STATUS_COLORS.enrolled;
                const isEditing = progressEnrollId === enr.id;

                return (
                  <div key={enr.id} style={{
                    background: "white", borderRadius: 12, border: "1.5px solid var(--border)",
                    padding: "16px 20px", display: "flex", gap: 16, alignItems: "flex-start",
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: `${CAT_COLORS[enr.category || "Technical"] || "#64748b"}18`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                    }}>
                      📚
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{enr.title || `Course ${enr.course_id.slice(0, 8)}`}</div>
                      <div style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--ink-3)", marginBottom: 10, flexWrap: "wrap" }}>
                        {enr.category && <span>{enr.category}</span>}
                        {enr.duration && <span>⏱ {enr.duration}</span>}
                        <span>Enrolled: {enr.enrolled_at.split("T")[0]}</span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                          <span style={{ padding: "1px 8px", borderRadius: 20, fontWeight: 700, background: sc.bg, color: sc.text, textTransform: "capitalize" }}>
                            {enr.status.replace("_", " ")}
                          </span>
                          <span style={{ color: "var(--ink-3)" }}>{enr.progress}%</span>
                        </div>
                        <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${enr.progress}%`, background: enr.status === "completed" ? "#22c55e" : "var(--accent)", borderRadius: 3, transition: "width 0.3s" }} />
                        </div>
                      </div>

                      {/* Progress slider */}
                      {isEditing ? (
                        <progressFetcher.Form method="post" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                          <input type="hidden" name="intent" value="update-progress" />
                          <input type="hidden" name="enrollmentId" value={enr.id} />
                          <input type="hidden" name="courseId" value={enr.course_id} />
                          <input type="range" name="progress" min={0} max={100} value={progressVal}
                            onChange={e => setProgressVal(Number(e.target.value))}
                            style={{ flex: 1 }} />
                          <span style={{ fontSize: 13, fontWeight: 700, width: 36 }}>{progressVal}%</span>
                          <button className="btn btn-primary" style={{ fontSize: 11, padding: "4px 10px" }} type="submit"
                            disabled={progressFetcher.state !== "idle"}>
                            Save
                          </button>
                          <button type="button" className="btn btn-outline" style={{ fontSize: 11, padding: "4px 10px" }}
                            onClick={() => setProgressEnrollId(null)}>
                            Cancel
                          </button>
                        </progressFetcher.Form>
                      ) : enr.status !== "completed" && (
                        <button className="btn btn-outline" style={{ fontSize: 11, padding: "4px 10px", marginTop: 6 }}
                          onClick={() => { setProgressEnrollId(enr.id); setProgressVal(enr.progress); }}>
                          Update Progress
                        </button>
                      )}

                      {enr.status === "completed" && enr.completed_at && (
                        <div style={{ fontSize: 11, color: "#16a34a", marginTop: 6, fontWeight: 600 }}>
                          ✓ Completed on {enr.completed_at.split("T")[0]}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

    </HRMSLayout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelSt: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6,
};
const fieldSt: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8,
  fontSize: 13, background: "white", fontFamily: "inherit", color: "var(--ink)",
  outline: "none", boxSizing: "border-box" as const,
};
function toastStyle(bg: string): React.CSSProperties {
  return {
    position: "fixed", top: 20, right: 20, zIndex: 9999,
    background: bg, color: "white", padding: "12px 20px", borderRadius: 12,
    fontSize: 13, fontWeight: 600, boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
    maxWidth: 380, display: "flex", alignItems: "center", gap: 10,
  };
}
