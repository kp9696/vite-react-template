import { useState, useEffect } from "react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/home";
import { requireSignedInUser } from "../lib/jwt-auth.server";

// ── Server ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  try {
    await requireSignedInUser(request, context.cloudflare.env);
    return redirect("/hrms");
  } catch {
    return {};
  }
}

export function meta() {
  return [
    { title: "JWithKP HRMS – Modern HR & Payroll Platform for India & GCC" },
    { name: "description", content: "Automate payroll, compliance (PF/ESI/GOSI/WPS), attendance, and asset management. Built for growing teams in India & GCC. Free up to 10 employees." },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { name: "canonical", content: "https://hrms.jwithkp.com" },
    { name: "og:title", content: "JWithKP HRMS – Modern HR for India & GCC" },
    { name: "og:description", content: "Ditch outdated HR software. Get automated compliance, asset tracking, and a beautiful interface. Free plan available." },
    { name: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

// ── JSON-LD Structured Data ──────────────────────────────────────────────────

function JsonLd() {
  return (
    <script type="application/ld+json">
      {JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "JWithKP HRMS",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web, iOS, Android",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "INR",
          "description": "Free plan for up to 10 employees"
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.8",
          "ratingCount": "187",
          "bestRating": "5",
          "worstRating": "1"
        },
        "featureList": "Automated PF/ESI/GOSI/WPS Compliance, Asset Management, GPS Attendance, Payroll Automation, Performance Tracking",
        "sameAs": [
          "https://twitter.com/jwithkp",
          "https://linkedin.com/company/jwithkp"
        ]
      })}
    </script>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const COMPANY_LOGOS = [
  { name: "TechStart India", initials: "TS", color: "bg-blue-500" },
  { name: "Saudi Tech Solutions", initials: "ST", color: "bg-emerald-500" },
  { name: "Creative Agency Co", initials: "CA", color: "bg-purple-500" },
  { name: "Global Tech Group", initials: "GT", color: "bg-amber-500" },
  { name: "InnovateLabs", initials: "IL", color: "bg-pink-500" },
  { name: "Digital First Pvt", initials: "DF", color: "bg-cyan-500" },
  { name: "Cloud Native Systems", initials: "CN", color: "bg-indigo-500" },
  { name: "NextGen Solutions", initials: "NG", color: "bg-orange-500" },
];

const CASE_STUDIES = [
  {
    id: 1,
    stat: "10 hrs/week saved on payroll processing",
    description: "By automating salary calculations and PF/ESI filings, a 120-person tech company reduced manual payroll from 4 days to under 30 minutes. HR teams now focus on people, not paperwork."
  },
  {
    id: 2,
    stat: "70% faster statutory compliance",
    description: "GOSI and WPS compliance used to require 2 weeks of manual reconciliation. With JWithKP's automated reporting, it's completed in 2 days — with zero audit findings in the last inspection."
  },
  {
    id: 3,
    stat: "₹18,000/year saved on attendance tools",
    description: "GPS-verified attendance, face check-in, and geo-tagging are included in every plan at no extra charge. A 60-person team eliminated separate attendance software entirely."
  },
];

const FEATURES = [
  {
    icon: "⚖️",
    title: "Statutory Compliance",
    desc: "PF, ESI, TDS, PT, LWF, GOSI, WPS — auto-calculated, auto-filed. Always up to date with the latest regulations.",
    badge: "India & GCC",
    badgeColor: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: "💻",
    title: "Asset Management",
    desc: "Track laptops, phones, and equipment end-to-end. Assign, return, audit — full lifecycle visibility in one place.",
    badge: "Built-in",
    badgeColor: "bg-purple-100 text-purple-700",
  },
  {
    icon: "📍",
    title: "GPS Attendance",
    desc: "Geo-fenced check-in with face verification. Works on any smartphone, with live location tracking and selfie audit.",
    badge: "Included",
    badgeColor: "bg-amber-100 text-amber-700",
  },
  {
    icon: "💰",
    title: "Payroll Automation",
    desc: "Compute salaries, deductions, and net pay in seconds. Generate payslips and disburse payments — all compliance-ready.",
    badge: "",
    badgeColor: "",
  },
  {
    icon: "📊",
    title: "People Analytics",
    desc: "Real-time headcount, attendance trends, expense tracking, and 15+ exportable reports for smarter decisions.",
    badge: "",
    badgeColor: "",
  },
  {
    icon: "🔐",
    title: "API & SSO — No Upsells",
    desc: "Full REST API access and single sign-on are standard in the Professional plan. No hidden add-ons, no enterprise gates.",
    badge: "Transparent",
    badgeColor: "bg-blue-100 text-blue-700",
  },
];

const COMPLIANCE_FEATURES = [
  { country: "India", code: "IN", flag: "🇮🇳", laws: "PF, ESI, PT, LWF, TDS", color: "bg-orange-50 border-orange-200" },
  { country: "Saudi Arabia", code: "SA", flag: "🇸🇦", laws: "GOSI, WPS, VAT", color: "bg-green-50 border-green-200" },
  { country: "UAE", code: "AE", flag: "🇦🇪", laws: "WPS, Pension, VAT", color: "bg-red-50 border-red-200" },
  { country: "Qatar", code: "QA", flag: "🇶🇦", laws: "WPS, Social Security", color: "bg-blue-50 border-blue-200" },
];

const TESTIMONIALS = [
  {
    name: "Priya Sharma",
    role: "HR Director",
    company: "TechStart India",
    text: "Asset tracking, payroll, and compliance all in one place — and it actually looks good. Our HR team went from dreading payroll day to finishing it before lunch.",
    avatar: "PS",
    tag: "Payroll & Compliance",
  },
  {
    name: "Ahmed Al-Rashid",
    role: "Operations Head",
    company: "Saudi Tech Solutions",
    text: "GOSI and WPS filings used to take our team two full weeks. Now it's done in a day. The compliance engine is accurate, fast, and the audit reports are inspection-ready.",
    avatar: "AR",
    tag: "GCC Compliance",
  },
  {
    name: "Neha Kapoor",
    role: "Founder",
    company: "Creative Agency Co",
    text: "Transparent pricing, no hidden add-ons, and onboarding took under 10 minutes. GPS attendance and payroll in one plan — exactly what a 40-person agency needs.",
    avatar: "NK",
    tag: "Onboarding & Attendance",
  },
];

const STATS = [
  { value: "500+", label: "Active Teams", note: "Growing 40% MoM" },
  { value: "25,000+", label: "Employees Managed", note: "Across 12 countries" },
  { value: "₹2.3Cr+", label: "Payroll Processed", note: "Last 30 days" },
  { value: "99.97%", label: "Platform Uptime", note: "Monthly average" },
];

const DIFFERENTIATORS = [
  {
    icon: "🚀",
    title: "Up and running in under 10 minutes",
    desc: "No IT team, no multi-day implementation. Sign up, configure your company, invite your team — and you're live. Most teams run their first payroll on day one.",
    color: "bg-blue-50 border-blue-200",
    iconBg: "bg-blue-100",
  },
  {
    icon: "🌏",
    title: "Built for India & GCC from the ground up",
    desc: "PF, ESI, PT, TDS, LWF for India. GOSI, WPS, and pension regulations for Saudi, UAE, and Qatar. Not an afterthought — built into every payroll run.",
    color: "bg-emerald-50 border-emerald-200",
    iconBg: "bg-emerald-100",
  },
  {
    icon: "💼",
    title: "Asset management that most HR tools skip",
    desc: "Assign laptops, phones, and equipment to employees. Track returns, generate audit trails, and get notified on exit. Fully integrated with the employee lifecycle.",
    color: "bg-purple-50 border-purple-200",
    iconBg: "bg-purple-100",
  },
  {
    icon: "💡",
    title: "Pricing that doesn't punish growth",
    desc: "One transparent price. GPS attendance, API access, and SSO are included — not locked behind enterprise tiers. Know exactly what you pay as your team grows.",
    color: "bg-amber-50 border-amber-200",
    iconBg: "bg-amber-100",
  },
];

// ── Components ────────────────────────────────────────────────────────────────

function ComplianceBanner() {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const dismissed = localStorage.getItem("compliance-banner-dismissed");
    if (dismissed === "true") setIsVisible(false);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem("compliance-banner-dismissed", "true");
  };

  if (!isVisible) return null;

  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 border-b border-blue-700">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-sm text-white">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="font-medium">India & GCC compliance now live — PF, ESI, GOSI, WPS auto-calculated every payroll run.</span>
          <a href="#compliance" className="hidden sm:inline text-blue-200 hover:text-white font-semibold transition-colors">
            See all supported laws →
          </a>
        </div>
        <button onClick={handleDismiss} className="text-blue-300 hover:text-white text-xs transition-colors shrink-0">
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Navbar with Active Section Detection ──
function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [whySwitchOpen, setWhySwitchOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const observedSections = ["features", "how-it-works", "compare", "testimonials", "pricing"];
    const elements = observedSections
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        root: null,
        rootMargin: "-90px 0px -45% 0px",
        threshold: [0.2, 0.35, 0.5, 0.65],
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleHashLink = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
      window.history.pushState(null, "", `#${id}`);
    }
    setOpen(false);
    setWhySwitchOpen(false);
  };

  const isActive = (id: string) => {
    if (id === "why-switch") {
      return activeSection === "compare" || activeSection === "testimonials";
    }
    return activeSection === id;
  };

  return (
    <nav className={`sticky top-0 z-50 transition-all duration-300 ${
      scrolled ? "bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm" : "bg-white border-b border-slate-100"
    }`}>
      <div className="max-w-6xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
        <div className="flex items-center gap-3">
          <img src="/jk-logo.png" alt="JWithKP HRMS" className="h-8 w-auto" />
          <span className="font-bold text-slate-900 text-[17px] tracking-tight">
            JWithKP <span className="text-blue-600">HRMS</span>
          </span>
          <span className="hidden lg:inline text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-2">
            India & GCC HR Platform
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          {["Features", "How it Works", "Pricing"].map((item) => {
            const id = item.toLowerCase().replace(/\s+/g, "-");
            return (
              <button
                key={item}
                onClick={() => handleHashLink(id)}
                className={`text-sm font-medium transition-colors cursor-pointer ${
                  isActive(id)
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-slate-600 hover:text-blue-600"
                }`}
              >
                {item}
              </button>
            );
          })}
          
          {/* ── Why Switch Dropdown ── */}
          <div className="relative">
            <button
              onClick={() => setWhySwitchOpen(!whySwitchOpen)}
              className={`text-sm font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                isActive("why-switch")
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-600 hover:text-blue-600"
              }`}
            >
              Why Switch
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d={whySwitchOpen ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
              </svg>
            </button>
            {whySwitchOpen && (
              <div className="absolute top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-50">
                <button
                  onClick={() => handleHashLink("compare")}
                  className="block w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors"
                >
                  📊 Comparison Table
                </button>
                <button
                  onClick={() => handleHashLink("testimonials")}
                  className="block w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 border-t border-slate-100 transition-colors"
                >
                  💬 Testimonials
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors px-3 py-2">
            Login
          </Link>
          <Link to="/register" className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
            Start Free
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-slate-600"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation menu"
          aria-expanded={open}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            {open
              ? <path d="M18 6 6 18M6 6l12 12" />
              : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-slate-200 px-6 py-4 flex flex-col gap-4">
          {["Features", "How it Works", "Pricing"].map((item) => {
            const id = item.toLowerCase().replace(/\s+/g, "-");
            return (
              <button
                key={item}
                onClick={() => handleHashLink(id)}
                className="text-sm font-medium text-slate-600 text-left"
              >
                {item}
              </button>
            );
          })}
          <div>
            <button
              onClick={() => setWhySwitchOpen(!whySwitchOpen)}
              className="text-sm font-medium text-slate-600 text-left flex items-center gap-2"
            >
              Why Switch
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d={whySwitchOpen ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
              </svg>
            </button>
            {whySwitchOpen && (
              <div className="mt-2 ml-4 flex flex-col gap-2">
                <button
                  onClick={() => handleHashLink("compare")}
                  className="text-sm text-slate-500 text-left hover:text-blue-600"
                >
                  Comparison Table
                </button>
                <button
                  onClick={() => handleHashLink("testimonials")}
                  className="text-sm text-slate-500 text-left hover:text-blue-600"
                >
                  Testimonials
                </button>
              </div>
            )}
          </div>
          <hr className="border-slate-200" />
          <Link to="/login" className="text-sm font-semibold text-slate-700">Login</Link>
          <Link to="/register" className="text-sm font-semibold bg-blue-600 text-white px-5 py-2.5 rounded-lg text-center">
            Start Free
          </Link>
        </div>
      )}
    </nav>
  );
}

// ── Dashboard Preview with Interactive Rows ──
function DashboardPreview() {
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden transition-all duration-300 hover:shadow-xl">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center gap-2">
        <div className="flex gap-1.5">
          {["bg-white/30", "bg-white/30", "bg-white/30"].map((c, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`} />
          ))}
        </div>
        <span className="text-white/60 text-xs ml-2 font-mono">hrms.jwithkp.com/dashboard</span>
        <span className="ml-auto text-white/40 text-[10px] font-mono">Live demo</span>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { emoji: "👥", val: "142", label: "Employees", sub: "+12 this month", color: "text-blue-600" },
            { emoji: "✅", val: "118", label: "Present Today", sub: "89% attendance", color: "text-emerald-600" },
            { emoji: "📍", val: "112", label: "GPS Verified", sub: "Saved ₹2,800", color: "text-amber-600" },
            { emoji: "💰", val: "₹2.5L", label: "Payroll Ready", sub: "Auto PF/ESI", color: "text-purple-600" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100 hover:border-blue-200 transition-colors">
              <div className="text-lg mb-1">{s.emoji}</div>
              <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{s.label}</div>
              <div className="text-[9px] text-green-600 mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2 flex justify-between">
          <span>Recent Activity</span>
          <span className="text-blue-600 text-[9px] font-normal">Live sync</span>
        </div>
        {[
          { initials: "PS", name: "Priya S.", action: "Checked In • GPS: Bangalore", time: "2m ago", color: "bg-indigo-500", gps: true },
          { initials: "AM", name: "Arjun M.", action: "Asset assigned: MacBook Pro", time: "5m ago", color: "bg-emerald-500", asset: true },
          { initials: "NR", name: "Neha R.", action: "Leave approved • PF updated", time: "18m ago", color: "bg-amber-500", comp: true },
        ].map((a) => (
          <div
            key={a.name}
            onClick={() => setSelectedActivity(a.name)}
            className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0 group hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors cursor-pointer"
            aria-label={`Activity row: ${a.name}`}
          >
            <div className={`w-7 h-7 rounded-full ${a.color} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
              {a.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-slate-700 truncate">{a.name}</div>
              <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                {a.action}
                {a.gps && <span className="text-[8px] bg-blue-100 text-blue-600 px-1 rounded">📍</span>}
                {a.asset && <span className="text-[8px] bg-purple-100 text-purple-600 px-1 rounded">💻 Asset</span>}
                {a.comp && <span className="text-[8px] bg-green-100 text-green-600 px-1 rounded">✓ Compliant</span>}
              </div>
            </div>
            <div className="text-[10px] text-slate-300 shrink-0">{a.time}</div>
          </div>
        ))}
      </div>

      {/* Activity Tooltip Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setSelectedActivity(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-2">Live Dashboard Activity</h3>
            <p className="text-slate-600 mb-6">
              This is a live preview. In the actual app, you can click any activity to view full details, approve requests, reassign tasks, or take immediate action — all in real-time.
            </p>
            <button
              onClick={() => setSelectedActivity(null)}
              className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonTable() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-lg">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-white border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Feature</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-blue-700">JWithKP HRMS</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-500">greytHR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {COMPETITOR_COMPARISON.features.map((feature, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-3 text-sm font-medium text-slate-800">{feature.name}</td>
                <td className="px-6 py-3">
                  {typeof feature.jwithkp === "boolean" ? (
                    feature.jwithkp ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        ✓ Included
                        {feature.note && feature.note.includes("extra") && (
                          <span className="text-emerald-700 text-xs font-normal">(No extra fee)</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )
                  ) : (
                    <span className="text-emerald-600 font-semibold">{feature.jwithkp}</span>
                  )}
                </td>
                <td className="px-6 py-3">
                  {typeof feature.greythr === "boolean" ? (
                    feature.greythr ? (
                      <span className="text-slate-600 flex items-center gap-1">
                        ✓ Included
                        {feature.note && <span className="text-amber-600 text-xs">({feature.note})</span>}
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center gap-1">
                        ✗ Not available
                        {feature.note && <span className="text-amber-600 text-xs">({feature.note})</span>}
                      </span>
                    )
                  ) : (
                    <span className="text-slate-600">{feature.greythr}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-blue-50 px-6 py-4 border-t border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm text-blue-800 flex items-start sm:items-center gap-2">
          <span className="text-lg leading-none mt-0.5 sm:mt-0">💡</span>
          <span><strong>Why teams switch:</strong> "Better UI, asset tracking included, transparent pricing, and we save ₹25/user/month on GPS attendance."</span>
        </p>
        <p className="text-xs text-slate-400 whitespace-nowrap">Based on 150+ migration reviews · Oct 2024–Mar 2025</p>
      </div>
    </div>
  );
}

function PricingCard({
  name,
  price,
  period,
  desc,
  features,
  highlight,
  recommended,
  employeeCap,
  extraNote,
  isStarter
}: {
  name: string;
  price: string;
  period?: string;
  desc: string;
  features: string[];
  highlight?: boolean;
  recommended?: boolean;
  employeeCap: string;
  extraNote?: string;
  isStarter?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-8 border-2 transition-all duration-300 hover:-translate-y-1 ${
        highlight
          ? "bg-blue-600 text-white border-blue-600 shadow-2xl md:scale-105"
          : isStarter
          ? "bg-white border-emerald-500 shadow-2xl md:scale-105"
          : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-xl"
      } ${recommended ? "ring-4 ring-amber-300 ring-offset-2" : ""}`}
    >
      <h3 className={`text-2xl font-bold mb-2 ${highlight ? "text-white" : "text-slate-900"}`}>
        {name}
      </h3>
      <p className={`text-sm mb-6 ${highlight ? "text-blue-100" : "text-slate-600"}`}>{desc}</p>
      <div className="mb-2">
        <span className={`text-4xl font-extrabold ${highlight ? "text-white" : "text-slate-900"}`}>
          {price}
        </span>
        {period && <span className={highlight ? "text-blue-100" : "text-slate-600"}>{period}</span>}
      </div>
      <p className={`text-xs mb-6 ${highlight ? "text-blue-200" : "text-slate-500"}`}>{employeeCap}</p>
      {extraNote && (
        <p
          className={`text-xs mb-4 p-2 rounded-lg ${
            highlight ? "bg-blue-500 text-blue-50" : "bg-green-50 text-green-700"
          }`}
        >
          {extraNote}
        </p>
      )}
      <Link
        to="/register"
        className={`block text-center font-bold py-3 rounded-lg mb-8 transition-all ${
          highlight
            ? "bg-white text-blue-600 hover:bg-blue-50"
            : isStarter
            ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-md hover:from-green-600 hover:to-emerald-700"
            : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md"
        }`}
      >
        {isStarter ? "Start Free – No CC Required →" : "Get Started →"}
      </Link>
      <ul className="space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <span className={`text-xl mt-0.5 ${highlight ? "text-blue-100" : "text-blue-600"}`}>✓</span>
            <span className={`text-sm ${highlight ? "text-blue-50" : "text-slate-700"}`}>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Case Study Modal Component ──
function CaseStudyModal({ study, onClose }: { study: (typeof CASE_STUDIES)[0] | null; onClose: () => void }) {
  if (!study) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-3 text-slate-900">{study.stat}</h3>
        <p className="text-slate-600 mb-6">{study.description}</p>
        <button
          onClick={onClose}
          className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Help Me Choose Component ──
function HelpMeChoose({ onRecommend }: { onRecommend: (plan: string) => void }) {
  const [employees, setEmployees] = useState<string>("");
  const [needsPayroll, setNeedsPayroll] = useState<boolean | null>(null);
  const [recommended, setRecommended] = useState<string | null>(null);

  const handleShowPlan = () => {
    if (!employees || needsPayroll === null) return;

    let plan = "Starter";
    if (employees === "10-100" || employees === "100+") {
      plan = "Professional";
    }
    if (employees === "100+" && needsPayroll) {
      plan = "Enterprise";
    }
    setRecommended(plan);
    onRecommend(plan);

    setTimeout(() => {
      const pricingElement = document.getElementById("pricing");
      if (pricingElement) {
        pricingElement.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200 mb-12">
      <h3 className="text-2xl font-bold text-slate-900 mb-2">Help Me Choose</h3>
      <p className="text-slate-600 mb-6">Answer 2 quick questions to find your perfect plan</p>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">How many employees?</label>
          <select
            value={employees}
            onChange={(e) => setEmployees(e.target.value)}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select...</option>
            <option value="<10">Less than 10</option>
            <option value="10-100">10-100</option>
            <option value="100+">100+</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Need payroll automation?</label>
          <div className="flex gap-3">
            <button
              onClick={() => setNeedsPayroll(true)}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
                needsPayroll === true
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-white border border-slate-300 text-slate-700 hover:border-blue-300"
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => setNeedsPayroll(false)}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
                needsPayroll === false
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-white border border-slate-300 text-slate-700 hover:border-blue-300"
              }`}
            >
              No
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={handleShowPlan}
        disabled={!employees || needsPayroll === null}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-lg transition-all"
      >
        Show my plan →
      </button>

      {recommended && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            ✓ Recommended: <strong>{recommended}</strong> Plan
          </p>
        </div>
      )}
    </div>
  );
}

// ── Hero Section with Trust Signals ──
function HeroSection() {
  const handleScrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 pt-16 md:pt-24 pb-0 px-6 md:px-8">
      {/* Subtle dot grid */}
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      {/* Glow blobs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

      <div className="relative max-w-4xl mx-auto text-center">
        {/* Live badge */}
        <div className="inline-flex items-center gap-2 bg-white/10 text-white/90 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 border border-white/20 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Production Ready · 99.97% Uptime
        </div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white leading-[1.15] tracking-tight mb-6">
          The HR platform built for
          <span className="block text-blue-200 mt-1">India & GCC teams.</span>
        </h1>

        {/* Subtext */}
        <p className="text-blue-100 text-base md:text-xl leading-relaxed mb-10 max-w-2xl mx-auto">
          Payroll automation, statutory compliance, GPS attendance, and asset management —
          all in one platform. Free up to 10 employees, no credit card needed.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-10">
          <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-bold px-8 py-4 rounded-xl hover:bg-blue-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 text-base">
            Get Started Free →
          </Link>
          <Link to="/demo" className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/30 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/20 transition-all text-base backdrop-blur-sm">
            See a Live Demo
          </Link>
        </div>

        {/* Trust chips */}
        <div className="flex flex-wrap justify-center gap-3 mb-14 text-blue-100 text-xs">
          <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full border border-white/15">⚖️ PF · ESI · GOSI · WPS</span>
          <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full border border-white/15">📍 GPS Attendance Included</span>
          <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full border border-white/15">💻 Asset Management Built-in</span>
          <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full border border-white/15">🔒 Audit-Ready Reports</span>
        </div>

        {/* Dashboard preview — raised card at bottom of hero */}
        <div className="relative mx-auto max-w-2xl mt-10">
          <div className="absolute -inset-4 bg-blue-900/20 blur-2xl rounded-3xl" />
          <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 max-h-72 overflow-y-hidden">
            <DashboardPreview />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-indigo-800 to-transparent pointer-events-none rounded-b-2xl" />
        </div>
      </div>
    </section>
  );
}

// ── Logo Carousel (replaces static stats) ──
function LogoCarousel() {
  return (
    <section id="stats" className="bg-slate-900 py-16 md:py-24 px-6 md:px-8">
      <div className="max-w-6xl mx-auto">
        <p className="text-center text-slate-400 text-sm md:text-base mb-10 md:mb-12">
          Trusted by 500+ growing teams across India, Saudi Arabia, UAE, Qatar, and beyond
        </p>

        <div className="overflow-hidden">
          <div className="flex gap-6 md:gap-8 animate-scroll">
            {[...COMPANY_LOGOS, ...COMPANY_LOGOS].map((logo, idx) => (
              <div
                key={`${logo.name}-${idx}`}
                className="flex-shrink-0 w-32 md:w-40 h-16 md:h-20 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center group hover:border-white/20 transition-all"
              >
                <div className="text-center">
                  <div className={`${logo.color} w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm mx-auto mb-2`}>
                    {logo.initials}
                  </div>
                  <p className="text-white/60 text-xs font-semibold truncate px-2">{logo.name.split(" ")[0]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center mt-12 md:mt-16">
          {STATS.map((s) => (
            <div key={s.label} className="group">
              <div className="text-3xl md:text-4xl font-extrabold text-white mb-1 group-hover:scale-105 transition-transform">
                {s.value}
              </div>
              <div className="text-slate-400 text-xs md:text-sm">{s.label}</div>
              <div className="text-slate-500 text-[10px] mt-1">{s.note}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
}

function ComplianceSection() {
  return (
    <section id="compliance" className="py-20 md:py-28 px-6 md:px-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10 md:mb-12">
          <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider mb-4">
            Regional Compliance Made Simple
          </span>
          <h2 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-4 leading-tight">
            Automated compliance for every region you operate in
          </h2>
          <p className="text-slate-600 text-sm md:text-lg max-w-2xl mx-auto leading-relaxed" style={{ textWrap: "balance" } as React.CSSProperties}>
            PF, ESI, GOSI, WPS — we handle the math, filings, and reports so you don't have to.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-10 md:mb-12">
          {COMPLIANCE_FEATURES.map((c) => (
            <div key={c.country} className={`${c.color} border rounded-lg md:rounded-xl p-3 md:p-5 text-center hover:shadow-md transition-all`}>
              <div className="flex items-center justify-center gap-1.5 mb-1 md:mb-2">
                <span className="text-xl md:text-2xl leading-none" aria-hidden="true">{c.flag}</span>
                <span className="text-xs font-bold text-slate-600 bg-white/70 px-1.5 py-0.5 rounded border border-slate-200">{c.code}</span>
              </div>
              <div className="font-semibold text-slate-800 text-xs md:text-sm mb-1">{c.country}</div>
              <div className="text-[10px] md:text-xs text-slate-500">{c.laws}</div>
            </div>
          ))}
        </div>

        {/* ── Compliance Badge ── */}
        <div className="bg-blue-50 rounded-2xl p-4 md:p-6 border border-blue-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl md:text-3xl">🔒</span>
            <div>
              <div className="font-semibold text-slate-800 text-sm md:text-base">Real-time statutory updates • Audit-ready reports</div>
              <div className="text-xs md:text-sm text-slate-600">Auto-generated for PF, ESI, GOSI inspections</div>
            </div>
          </div>
          <Link to="/compliance-check" className="text-blue-700 font-semibold text-xs md:text-sm hover:text-blue-800 whitespace-nowrap">
            Check your requirements →
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-28 px-6 md:px-8 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider mb-4">
            Complete HR Solution
          </span>
          <h2 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-4 leading-tight">
            Everything your HR team needs, in one platform
          </h2>
          <p className="text-slate-500 text-sm md:text-lg max-w-2xl mx-auto leading-relaxed" style={{ textWrap: "balance" } as React.CSSProperties}>
            From onboarding to exit — payroll, compliance, attendance, assets, and analytics — fully integrated.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 md:gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-slate-50 rounded-2xl p-7 md:p-9 border border-slate-200 hover:border-blue-300 hover:shadow-xl transition-all duration-300 group">
              <div className="flex justify-between items-start mb-5">
                <div className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-sm text-2xl group-hover:scale-110 transition-transform border border-slate-100">{f.icon}</div>
                {f.badge && (
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${f.badgeColor}`}>
                    {f.badge}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const STEPS = [
    { step: "01", icon: "🏢", title: "Set Up Your Company", desc: "Register in under 2 minutes. Add company details, configure compliance rules for your region (PF/ESI/GOSI)." },
    { step: "02", icon: "📧", title: "Invite Your Team", desc: "Share invite links. Employees self-register with GPS-enabled check-in from day one." },
    { step: "03", icon: "⚡", title: "Run Payroll & Track Assets", desc: "Process payroll with auto-compliance, assign assets, approve leaves — all from one dashboard." },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 px-6 md:px-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider mb-4">
            Get Started in Minutes
          </span>
          <h2 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
            From signup to payroll — under 10 minutes
          </h2>
          <p className="text-slate-500 text-sm md:text-lg mt-3 md:mt-4">No IT team, no lengthy implementation, no hidden complexity.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {STEPS.map((s, i) => (
            <div key={s.step} className="relative group">
              <div className="bg-white rounded-2xl p-8 md:p-10 border border-slate-200 text-center hover:border-blue-300 hover:shadow-xl transition-all duration-300">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl text-3xl mx-auto mb-6 group-hover:scale-110 transition-transform border border-blue-100">
                  {s.icon}
                </div>
                <div className="text-sm font-black text-blue-500 tracking-widest mb-3">STEP {s.step}</div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">{s.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-1/3 -right-4 w-8 h-0.5 bg-blue-200" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyUsSection() {
  return (
    <section id="compare" className="py-20 md:py-28 px-6 md:px-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 md:mb-16">
          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider mb-4">
            Why JWithKP
          </span>
          <h2 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-4 leading-tight">
            Built differently. On purpose.
          </h2>
          <p className="text-slate-500 text-sm md:text-lg max-w-2xl mx-auto" style={{ textWrap: "balance" } as React.CSSProperties}>
            We focused on the things that matter most to HR teams at growing companies in India and the GCC.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 md:gap-6">
          {DIFFERENTIATORS.map((d) => (
            <div key={d.title} className={`${d.color} border rounded-2xl p-7 md:p-9 hover:shadow-md transition-all`}>
              <div className={`w-12 h-12 ${d.iconBg} rounded-xl flex items-center justify-center text-2xl mb-5`}>
                {d.icon}
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{d.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{d.desc}</p>
            </div>
          ))}
        </div>

        {/* Bottom trust bar */}
        <div className="mt-10 md:mt-12 bg-white rounded-2xl border border-slate-200 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-wrap justify-center md:justify-start gap-8 text-center md:text-left">
            {[
              { val: "< 10 min", label: "Average onboarding time" },
              { val: "99.97%", label: "Platform uptime" },
              { val: "500+", label: "Teams actively using it" },
              { val: "12+", label: "Countries served" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-extrabold text-blue-600">{s.val}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <Link to="/register" className="shrink-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 text-sm">
            Start Free Today →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Case Study Snippets Section ──
function CaseStudiesSection() {
  const [selectedCase, setSelectedCase] = useState<(typeof CASE_STUDIES)[0] | null>(null);

  return (
    <section className="py-20 md:py-28 px-6 md:px-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
            Real results from real teams
          </h2>
          <p className="text-slate-600 text-sm md:text-base">
            Click any card to learn more
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 md:gap-6">
          {CASE_STUDIES.map((cs) => (
            <button
              key={cs.id}
              onClick={() => setSelectedCase(cs)}
              className="bg-white rounded-xl p-6 border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all text-left group"
              aria-label={`Case study: ${cs.stat}`}
            >
              <div className="text-2xl md:text-3xl font-black text-blue-600 mb-3">📈</div>
              <h3 className="font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{cs.stat}</h3>
              <p className="text-slate-500 text-sm">Click to learn more →</p>
            </button>
          ))}
        </div>
      </div>

      <CaseStudyModal study={selectedCase} onClose={() => setSelectedCase(null)} />
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-20 md:py-28 px-6 md:px-8 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider mb-4">
            500+ Teams Trust Us
          </span>
          <h2 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Loved by HR teams across India & GCC
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-4 md:gap-8">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="bg-slate-50 rounded-xl md:rounded-2xl p-5 md:p-8 border border-slate-200 hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
                <div className="w-10 md:w-12 h-10 md:h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs md:text-sm shrink-0">
                  {t.avatar}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 text-sm md:text-base truncate">{t.name}</div>
                  <div className="text-xs md:text-sm text-slate-500 truncate">{t.role}</div>
                  <div className="text-xs text-slate-400 truncate">{t.company}</div>
                </div>
              </div>
              <p className="text-slate-700 text-sm md:text-base leading-relaxed italic mb-4">"{t.text}"</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-400 text-sm">★</span>
                  ))}
                </div>
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full font-medium">
                  {t.tag}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-6 py-3 shadow-sm">
            <span className="text-2xl">🏆</span>
            <span className="text-sm text-slate-600">
              <strong className="text-slate-900">4.8 / 5 stars</strong> — rated by 187+ HR professionals across India & GCC
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const [recommendedPlan, setRecommendedPlan] = useState<string | null>(null);

  const PLANS = [
    {
      name: "Starter",
      price: "₹0",
      period: "/forever",
      desc: "For small teams and startups",
      employeeCap: "Up to 10 employees",
      features: [
        "Basic attendance tracking",
        "Leave management",
        "Up to 10 employees",
        "Email support",
        "Mobile app access",
      ],
      highlight: false,
      isStarter: true,
    },
    {
      name: "Professional",
      price: "₹5,000",
      period: "/month",
      desc: "For growing companies",
      employeeCap: "Up to 100 employees",
      extraNote: "💡 GPS attendance & asset management included — no add-ons needed",
      features: [
        "All Starter features",
        "Payroll automation (PF/ESI/GOSI)",
        "GPS attendance included (save ₹25/user)",
        "Asset management",
        "API access included",
        "SSO included",
        "Priority support",
      ],
      highlight: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      desc: "For large organizations",
      employeeCap: "Unlimited employees",
      extraNote: "🔐 SOC2 Type II, dedicated SLAs",
      features: [
        "All Professional features",
        "Unlimited employees",
        "Dedicated account manager",
        "Custom integrations",
        "24/7 phone support",
        "Advanced compliance reporting",
        "On-premise deployment option",
      ],
      highlight: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 md:py-28 px-6 md:px-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 md:mb-14">
          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider mb-4">
            Transparent Pricing
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
            No surprises. No "Enterprise" upcharges.
          </h2>
          <p className="text-slate-600 text-base md:text-lg max-w-2xl mx-auto">
            What you see is what you pay. API and SSO included in Professional — not hidden behind custom quotes.
          </p>
        </div>

        {/* ── Help Me Choose Tool ── */}
        <HelpMeChoose onRecommend={setRecommendedPlan} />

        <div className="grid md:grid-cols-3 gap-6 md:gap-8 mb-8 md:mb-12">
          {PLANS.map((plan) => (
            <PricingCard key={plan.name} {...plan} recommended={recommendedPlan === plan.name} />
          ))}
        </div>

        <div className="text-center text-xs md:text-sm text-slate-600">
          <p>💳 <strong><span className="inline-flex items-center gap-1"><span>🔒</span><span>No credit card required</span></span></strong> for free plan • Cancel anytime • Volume discounts available for 200+ employees</p>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-700 py-20 md:py-28 px-6 md:px-8">
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4 leading-tight">
          Your HR team deserves better tools.
        </h2>
        <p className="text-blue-100 text-base md:text-xl mb-8 max-w-2xl mx-auto">
          Join 500+ growing companies across India and the GCC who run payroll, compliance, and
          attendance in one place — starting free, no credit card needed.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 md:gap-4">
          <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-bold px-8 py-4 rounded-xl hover:bg-blue-50 transition-all shadow-xl hover:-translate-y-0.5 text-base">
            Get Started Free →
          </Link>
          <Link to="/demo" className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/30 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/20 transition-all text-base">
            Book a Demo
          </Link>
        </div>
        <p className="text-blue-200/70 text-xs mt-5">
          Free forever up to 10 employees · No credit card · Set up in under 10 minutes
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-slate-900 py-14 md:py-20 px-6 md:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 mb-8 md:mb-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 md:gap-2.5 mb-3 md:mb-4">
              <div className="w-7 md:w-8 h-7 md:h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs md:text-sm">J</div>
              <span className="font-bold text-white text-xs md:text-[16px]">JWithKP HRMS</span>
            </div>
            <p className="text-slate-400 text-xs md:text-sm leading-relaxed">
              Modern HR management for growing teams. Built for companies that want compliance without complexity.
            </p>
          </div>

          <div>
            <div className="text-[9px] md:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 md:mb-4">Product</div>
            <div className="flex flex-col gap-2 md:gap-3">
              {["Features", "Pricing", "Security", "Compliance"].map((l) => (
                <button
                  key={l}
                  className="text-slate-400 hover:text-white hover:underline text-xs md:text-sm transition-colors text-left cursor-pointer"
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[9px] md:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 md:mb-4">Account</div>
            <div className="flex flex-col gap-2 md:gap-3">
              {[{ label: "Login", href: "/login" }, { label: "Sign Up Free", href: "/register" }, { label: "Book a Demo", href: "/demo" }].map((l) => (
                <Link key={l.label} to={l.href} className="text-slate-400 hover:text-white hover:underline text-xs md:text-sm transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[9px] md:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 md:mb-4">Legal</div>
            <div className="flex flex-col gap-2 md:gap-3">
              <a href="/privacy" className="text-slate-400 hover:text-white hover:underline text-xs md:text-sm transition-colors">Privacy Policy</a>
              <a href="/terms" className="text-slate-400 hover:text-white hover:underline text-xs md:text-sm transition-colors">Terms of Service</a>
              <a href="/compliance" className="text-slate-400 hover:text-white hover:underline text-xs md:text-sm transition-colors">Compliance Docs</a>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-6 md:pt-8 flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4 text-slate-500 text-[10px] md:text-xs">
          <span>© {new Date().getFullYear()} JWithKP HRMS. All rights reserved.</span>
          <div className="flex gap-4 md:gap-6">
            <a href="/twitter" className="text-slate-400 hover:text-white hover:underline transition-colors">Twitter</a>
            <a href="/linkedin" className="text-slate-400 hover:text-white hover:underline transition-colors">LinkedIn</a>
            <a href="/github" className="text-slate-400 hover:text-white hover:underline transition-colors">GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Back to Top Button ──
function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 600);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!isVisible) return null;

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 md:bottom-8 left-6 md:left-8 z-40 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-full p-3 shadow-md hover:shadow-lg transition-all"
      aria-label="Back to top"
    >
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7 14l5-5 5 5" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// ── Persistent Floating CTA Button ──
function PersistentCTA() {
  const [isVisible, setIsVisible] = useState(false);
  const [showBounce, setShowBounce] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 400;
      if (isScrolled && !isVisible) {
        setIsVisible(true);
        setShowBounce(true);
        setTimeout(() => setShowBounce(false), 1000);
      } else if (!isScrolled && isVisible) {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className={`fixed bottom-6 md:bottom-8 right-4 md:right-6 z-50 ${showBounce ? "animate-bounce" : ""}`}>
      <Link
        to="/register"
        className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold px-5 md:px-6 py-3 md:py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all whitespace-nowrap text-sm md:text-base"
        aria-label="Start free plan - floating CTA"
      >
        Get Started Free →
      </Link>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased text-slate-800">
      <JsonLd />
      <ComplianceBanner />
      <Navbar />
      <HeroSection />
      <LogoCarousel />
      <ComplianceSection />
      <FeaturesSection />
      <HowItWorksSection />
      <WhyUsSection />
      <CaseStudiesSection />
      <TestimonialsSection />
      <PricingSection />
      <CTASection />
      <Footer />
      <PersistentCTA />
      <BackToTopButton />
    </div>
  );
}
