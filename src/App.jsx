import { useState, useEffect, useCallback } from "react";

const API = "https://opd-backend-685i.onrender.com";


// ─── API calls ──────────────────────────────────────────────────────────────
async function api(path, body) {
  const opts = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {};
  const r = await fetch(`${API}${path}`, { ...opts, signal: AbortSignal.timeout(45000) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Error ${r.status}`); }
  return r.json();
}

// ─── Local fallback ─────────────────────────────────────────────────────────
const RGN = {"Phnom Penh":1.20,"Siem Reap":1.05,"Battambang":0.90,"Sihanoukville":1.10,"Kampong Cham":0.85,"Rural Areas":0.75};
const FAC = {"Public Hospital":0.60,"Private Hospital":1.00,"Clinic":0.80,"Specialist Center":1.25};
const SPEC = {"General Practice":25,"Internal Medicine":40,"Cardiology":65,"Orthopedics":60,"Dermatology":45,"ENT":50,"Ophthalmology":55,"Neurology":70,"Pediatrics":35,"Gynecology":50,"Urology":55,"Gastroenterology":60};
const LABS = {"Complete Blood Count":15,"Blood Chemistry Panel":25,"Urinalysis":10,"Lipid Panel":20,"Thyroid Function":30,"HbA1c":18,"Liver Function":22,"Kidney Function":22,"X-Ray":35,"Ultrasound":50,"ECG":25,"CT Scan":150,"MRI":280};
const PROCS = {"Wound Care":40,"Minor Excision":120,"Joint Injection":80,"Abscess Drainage":90,"Endoscopy":250,"Colonoscopy":300,"Biopsy":180,"Cast Application":70,"Fracture Reduction":200,"Foreign Body Removal":60};
const PLANS = {Essential:{base:180,visits:12,lab:100,proc:0},Plus:{base:380,visits:24,lab:300,proc:200},Premium:{base:650,visits:999,lab:800,proc:600}};
const PKGS = {health_screening:{name:"Health Screening",base:120},chronic_care:{name:"Chronic Care (6mo)",base:280},maternity:{name:"Maternity OPD",base:450},executive_checkup:{name:"Executive Checkup",base:350}};
const ageFactor = a => a<=5?1.15:a<=17?0.90:a<=30?0.95:a<=45?1.00:a<=60?1.15:1.35;

function localVisit(inp) {
  let base = 25;
  if (inp.service_type === "specialist_visit") base = SPEC[inp.specialty] || 55;
  else if (inp.service_type === "lab_test") base = (inp.lab_tests||[]).reduce((s,t) => s + (LABS[t]||20), 0);
  else if (inp.service_type === "minor_procedure") base = PROCS[inp.procedure] || 60;
  const m = Math.round(ageFactor(inp.age) * (RGN[inp.region]||1) * (FAC[inp.facility_type]||1) * (1+inp.chronic_conditions*0.08) * 1000) / 1000;
  const sub = Math.round(base * m * 100) / 100;
  const disc = inp.has_insurance ? Math.round(sub * 0.30 * 100) / 100 : 0;
  return { quote_id: `LOCAL-${Date.now()}`, base_cost: base, cost_multiplier: m, subtotal: sub, insurance_discount: disc, final_cost: Math.round((sub-disc)*100)/100, model_version: "local", breakdown: { age_factor: ageFactor(inp.age), region_factor: RGN[inp.region]||1, facility_factor: FAC[inp.facility_type]||1 } };
}
function localAnnual(inp) {
  const p = PLANS[inp.plan_tier] || PLANS.Essential;
  const m = Math.round(ageFactor(inp.age) * (RGN[inp.region]||1) * (1+inp.chronic_conditions*0.08) * 1000) / 1000;
  const ff = 1 + (inp.family_size-1)*0.65;
  const ann = Math.round(p.base * m * ff * 100) / 100;
  return { quote_id: `LOCAL-${Date.now()}`, plan_tier: inp.plan_tier, annual_premium: ann, monthly_premium: Math.round(ann/12*100)/100, cost_multiplier: m, model_version: "local", plan_benefits: p, breakdown: { plan_base: p.base, family_factor: Math.round(ff*100)/100 } };
}
function localPackage(inp) {
  const pk = PKGS[inp.package_type] || PKGS.health_screening;
  const m = Math.round(ageFactor(inp.age) * (RGN[inp.region]||1) * 1000) / 1000;
  return { quote_id: `LOCAL-${Date.now()}`, package_name: pk.name, base_cost: pk.base, total_cost: Math.round(pk.base*m*100)/100, cost_multiplier: m, model_version: "local", breakdown: {} };
}

// ─── Icons ──────────────────────────────────────────────────────────────────
const I = {
  Steth: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.8 2.3A8 8 0 1 0 20 12"/><path d="M12 12v6a4 4 0 0 0 8 0v-1"/><circle cx="20" cy="14" r="2"/></svg>,
  Flask: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3h6M10 3v7.5L4 18.5A2 2 0 0 0 5.5 22h13a2 2 0 0 0 1.5-3.5L14 10.5V3"/></svg>,
  Scissors: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  Calendar: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Package: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Chev: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
  Arrow: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Spin: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>,
  Refresh: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
};

// ─── Styles ─────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Instrument+Serif:ital@0;1&display=swap');
:root {
  --pri:#0d9488; --pri-l:#14b8a6; --pri-d:#0f766e; --pri-bg:#f0fdfa;
  --acc:#6366f1; --acc-bg:#eef2ff; --warn:#f59e0b; --danger:#ef4444;
  --bg:#f8fafb; --surf:#fff; --surf2:#f1f5f9; --surf3:#e2e8f0;
  --txt:#0f172a; --txt2:#475569; --txt3:#94a3b8;
  --fd:'Instrument Serif',serif; --fb:'DM Sans',sans-serif;
  --r:14px; --rs:10px;
  --sh:0 1px 3px rgba(0,0,0,.04); --shm:0 4px 16px rgba(0,0,0,.06);
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--txt);font-family:var(--fb);-webkit-font-smoothing:antialiased}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

.app{min-height:100vh}

/* Nav */
.nav{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--surf3);padding:0 28px;height:60px;display:flex;align-items:center;justify-content:space-between}
.nav-brand{display:flex;align-items:center;gap:10px;cursor:pointer}
.nav-logo{width:34px;height:34px;background:var(--pri);border-radius:9px;display:flex;align-items:center;justify-content:center;color:white;font-family:var(--fd);font-weight:400;font-size:15px;font-style:italic}
.nav-title{font-family:var(--fd);font-size:18px;color:var(--txt);font-style:italic}
.nav-links{display:flex;gap:4px;align-items:center}
.nav-link{padding:7px 14px;border-radius:8px;font-size:13px;font-weight:500;color:var(--txt2);cursor:pointer;border:none;background:none;font-family:var(--fb);transition:all .2s}
.nav-link:hover{color:var(--pri);background:var(--pri-bg)}
.nav-link.active{color:var(--pri);background:var(--pri-bg);font-weight:600}
.status{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:100px;font-size:11px;font-weight:600}
.status.ok{background:rgba(13,148,136,.08);color:var(--pri)}
.status.off{background:rgba(239,68,68,.08);color:var(--danger)}
.dot{width:6px;height:6px;border-radius:50%}
.dot.ok{background:var(--pri)} .dot.off{background:var(--danger)}

/* Hero */
.hero{padding:44px 28px 36px;max-width:1060px;margin:0 auto;text-align:center}
.hero-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:100px;font-size:11px;font-weight:600;color:var(--pri);background:var(--pri-bg);letter-spacing:.6px;text-transform:uppercase;margin-bottom:14px}
.hero h1{font-family:var(--fd);font-size:38px;font-weight:400;font-style:italic;line-height:1.15;letter-spacing:-.5px;margin-bottom:10px}
.hero h1 span{color:var(--pri)}
.hero p{font-size:16px;color:var(--txt2);max-width:480px;margin:0 auto;line-height:1.55}

/* Tabs */
.tabs{display:flex;gap:6px;justify-content:center;margin-bottom:28px;padding:0 28px;flex-wrap:wrap}
.tab{display:flex;align-items:center;gap:7px;padding:10px 20px;border-radius:var(--rs);font-size:13px;font-weight:500;color:var(--txt2);cursor:pointer;border:1.5px solid var(--surf3);background:white;font-family:var(--fb);transition:all .2s}
.tab:hover{border-color:var(--pri-l);color:var(--pri)}
.tab.active{border-color:var(--pri);background:var(--pri-bg);color:var(--pri);font-weight:600}

/* Layout */
.main{max-width:1060px;margin:0 auto;padding:0 28px 48px;display:grid;grid-template-columns:1fr 1fr;gap:24px}
.card{background:var(--surf);border-radius:var(--r);border:1px solid var(--surf3);box-shadow:var(--sh);animation:fadeUp .4s ease both}
.form-card{padding:28px}
.form-card h3{font-family:var(--fd);font-size:19px;font-weight:400;font-style:italic;margin-bottom:20px}
.result-card{padding:28px;display:flex;flex-direction:column}
.result-card h3{font-family:var(--fd);font-size:19px;font-weight:400;font-style:italic;margin-bottom:16px}

/* Form */
.fg{margin-bottom:18px} .fl{display:block;font-size:11px;font-weight:600;color:var(--txt2);margin-bottom:5px;letter-spacing:.3px;text-transform:uppercase}
.fi,.fs{width:100%;padding:10px 13px;border-radius:var(--rs);border:1.5px solid var(--surf3);font-size:14px;font-family:var(--fb);color:var(--txt);background:white;transition:all .2s;outline:none;appearance:none}
.fi:focus,.fs:focus{border-color:var(--pri);box-shadow:0 0 0 3px rgba(13,148,136,.08)}
.sw{position:relative} .sw svg{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--txt3)}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:12px}

.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{padding:6px 12px;border-radius:8px;font-size:12px;font-weight:500;border:1.5px solid var(--surf3);cursor:pointer;transition:all .15s;background:white;font-family:var(--fb);color:var(--txt2)}
.chip:hover{border-color:var(--pri-l)}
.chip.sel{border-color:var(--pri);background:var(--pri-bg);color:var(--pri)}

.toggle-row{display:flex;align-items:center;gap:10px}
.toggle{width:40px;height:22px;border-radius:11px;border:none;cursor:pointer;position:relative;transition:all .2s}
.toggle.off{background:var(--surf3)} .toggle.on{background:var(--pri)}
.toggle::after{content:'';position:absolute;top:2px;width:18px;height:18px;border-radius:50%;background:white;transition:all .2s;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.toggle.off::after{left:2px} .toggle.on::after{left:20px}

.btn{width:100%;padding:13px;border-radius:var(--rs);font-size:14px;font-weight:600;color:white;background:var(--pri);border:none;cursor:pointer;transition:all .2s;font-family:var(--fb);display:flex;align-items:center;justify-content:center;gap:7px;margin-top:6px;box-shadow:0 2px 10px rgba(13,148,136,.25)}
.btn:hover{background:var(--pri-d);transform:translateY(-1px)} .btn:disabled{opacity:.6;cursor:not-allowed;transform:none}

/* Result */
.price-box{background:linear-gradient(135deg,var(--pri) 0%,#0d9488 50%,#0891b2 100%);border-radius:14px;padding:28px;color:white;margin-bottom:20px;position:relative;overflow:hidden}
.price-box::before{content:'';position:absolute;top:-40px;right:-20px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.06)}
.price-label{font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.8px;font-weight:500}
.price-amount{font-family:var(--fd);font-size:44px;font-weight:400;font-style:italic;margin:4px 0;position:relative;z-index:1}
.price-sub{font-size:13px;opacity:.75}
.price-tag{display:inline-flex;align-items:center;gap:4px;margin-top:10px;padding:3px 9px;border-radius:6px;background:rgba(255,255,255,.15);font-size:11px;font-weight:500}

.bk{display:flex;flex-direction:column;gap:0;flex:1}
.bk-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--surf2)}
.bk-row:last-child{border-bottom:none}
.bk-l{font-size:13px;color:var(--txt2)} .bk-v{font-size:13px;font-weight:600;color:var(--txt)}
.bk-v.hi{color:var(--pri)}

.qid{margin-top:14px;padding-top:14px;border-top:1px solid var(--surf3);display:flex;justify-content:space-between;align-items:center}
.qid span:first-child{font-size:10px;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.qid code{font-size:11px;color:var(--txt2);background:var(--surf2);padding:2px 7px;border-radius:5px}

.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:36px 16px;color:var(--txt3)}
.empty p{font-size:13px;line-height:1.5;margin-top:8px}

.warn-box{padding:8px 12px;border-radius:var(--rs);background:#fffbeb;border:1px solid #fef3c7;color:#92400e;font-size:11px;margin-top:10px;display:flex;align-items:center;gap:5px}

/* Admin */
.admin{max-width:1060px;margin:0 auto;padding:0 28px 48px}
.admin h2{font-family:var(--fd);font-size:26px;font-weight:400;font-style:italic;margin-bottom:6px}
.admin>p{font-size:14px;color:var(--txt2);margin-bottom:24px}
.admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.admin-card{background:white;border-radius:var(--r);border:1px solid var(--surf3);padding:24px}
.admin-card h4{font-family:var(--fd);font-size:17px;font-weight:400;font-style:italic;margin-bottom:14px}
.admin-card.full{grid-column:1/-1}

.pipeline{display:flex;gap:10px;flex-wrap:wrap}
.pipe-step{flex:1 1 140px;padding:14px;background:var(--surf2);border-radius:10px;border:1px solid var(--surf3)}
.pipe-step-num{font-size:12px;font-weight:600;color:var(--pri);margin-bottom:3px}
.pipe-step-name{font-size:13px;font-weight:500;color:var(--txt)}
.pipe-step-desc{font-size:11px;color:var(--txt3);margin-top:2px}

.btn-sm{padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;border:1.5px solid var(--pri);color:var(--pri);background:white;cursor:pointer;font-family:var(--fb);transition:all .2s;display:inline-flex;align-items:center;gap:5px}
.btn-sm:hover{background:var(--pri-bg)}

/* Footer */
.footer{padding:28px;max-width:1060px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--surf3);flex-wrap:wrap;gap:12px}
.footer p{font-size:11px;color:var(--txt3)}
.footer-tags{display:flex;gap:5px}
.footer-tag{padding:2px 8px;border-radius:5px;font-size:10px;font-weight:600;background:var(--surf2);color:var(--txt3)}

@media(max-width:768px){.main,.admin-grid{grid-template-columns:1fr}.hero h1{font-size:28px}.tabs{flex-direction:column;align-items:stretch}.nav-links{display:none}}
`;

export default function OPDPricing() {
  const [page, setPage] = useState("pricing");
  const [mode, setMode] = useState("visit"); // visit | annual | package
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [isLocal, setIsLocal] = useState(false);
  const [apiOk, setApiOk] = useState(null);

  // Visit inputs
  const [visit, setVisit] = useState({
    service_type: "general_consultation", age: 35, gender: "Male", region: "Phnom Penh",
    facility_type: "Private Hospital", specialty: "Internal Medicine",
    lab_tests: ["Complete Blood Count"], procedure: "Wound Care",
    has_insurance: false, chronic_conditions: 0,
  });
  // Annual inputs
  const [annual, setAnnual] = useState({ age: 35, gender: "Male", region: "Phnom Penh", plan_tier: "Plus", chronic_conditions: 0, family_size: 1 });
  // Package inputs
  const [pkg, setPkg] = useState({ package_type: "health_screening", age: 35, gender: "Male", region: "Phnom Penh", add_ons: [] });

  useEffect(() => {
    api("/health").then(() => setApiOk(true)).catch(() => setApiOk(false));
  }, []);

  const calculate = useCallback(async () => {
    setLoading(true); setResult(null); setIsLocal(false);
    try {
      let data;
      if (mode === "visit") data = await api("/api/v1/price/visit", visit);
      else if (mode === "annual") data = await api("/api/v1/price/annual-plan", annual);
      else data = await api("/api/v1/price/package", pkg);
      setResult({ mode, ...data });
    } catch {
      try {
        let local;
        if (mode === "visit") local = localVisit(visit);
        else if (mode === "annual") local = localAnnual(annual);
        else local = localPackage(pkg);
        setResult({ mode, ...local }); setIsLocal(true);
      } catch { /* noop */ }
    } finally { setLoading(false); }
  }, [mode, visit, annual, pkg]);

  const uv = (k, v) => setVisit(p => ({ ...p, [k]: v }));
  const ua = (k, v) => setAnnual(p => ({ ...p, [k]: v }));
  const up = (k, v) => setPkg(p => ({ ...p, [k]: v }));
  const toggleLab = (t) => setVisit(p => {
    const cur = p.lab_tests || [];
    return { ...p, lab_tests: cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t] };
  });

  return (
    <><style>{CSS}</style>
    <div className="app">
      <nav className="nav">
        <div className="nav-brand" onClick={() => setPage("pricing")}>
          <div className="nav-logo">Op</div>
          <span className="nav-title">OPD Pricing</span>
        </div>
        <div className="nav-links">
          <button className={`nav-link ${page==="pricing"?"active":""}`} onClick={() => setPage("pricing")}>Pricing</button>
          <button className={`nav-link ${page==="admin"?"active":""}`} onClick={() => setPage("admin")}>Admin</button>
        </div>
        <div className={`status ${apiOk===true?"ok":apiOk===false?"off":"off"}`}>
          <div className={`dot ${apiOk?"ok":"off"}`}/>{apiOk?"API Connected":"Offline Mode"}
        </div>
      </nav>

      {page === "pricing" && <>
        <section className="hero">
          <div className="hero-badge"><I.Steth /> Outpatient Pricing</div>
          <h1>Outpatient Care,<br/><span>Priced Intelligently</span></h1>
          <p>Get instant cost estimates for consultations, lab tests, procedures, annual plans, and care packages.</p>
        </section>

        <div className="tabs">
          <button className={`tab ${mode==="visit"?"active":""}`} onClick={() => {setMode("visit");setResult(null)}}><I.Steth /> Per Visit</button>
          <button className={`tab ${mode==="annual"?"active":""}`} onClick={() => {setMode("annual");setResult(null)}}><I.Calendar /> Annual Plan</button>
          <button className={`tab ${mode==="package"?"active":""}`} onClick={() => {setMode("package");setResult(null)}}><I.Package /> Packages</button>
        </div>

        <div className="main">
          <div className="card form-card">
            <h3>{mode==="visit"?"Visit details":mode==="annual"?"Plan details":"Package selection"}</h3>

            {/* ─── VISIT MODE ─── */}
            {mode === "visit" && <>
              <div className="fg">
                <label className="fl">Service Type</label>
                <div className="chips">
                  {[["general_consultation","Consultation"],["specialist_visit","Specialist"],["lab_test","Lab Tests"],["minor_procedure","Procedure"]].map(([k,l])=>(
                    <div key={k} className={`chip ${visit.service_type===k?"sel":""}`} onClick={()=>uv("service_type",k)}>{l}</div>
                  ))}
                </div>
              </div>
              {visit.service_type==="specialist_visit"&&<div className="fg"><label className="fl">Specialty</label><div className="sw"><select className="fs" value={visit.specialty} onChange={e=>uv("specialty",e.target.value)}>{Object.keys(SPEC).map(s=><option key={s}>{s}</option>)}</select><I.Chev/></div></div>}
              {visit.service_type==="lab_test"&&<div className="fg"><label className="fl">Select Tests</label><div className="chips">{Object.keys(LABS).map(t=><div key={t} className={`chip ${(visit.lab_tests||[]).includes(t)?"sel":""}`} onClick={()=>toggleLab(t)}>{t} (${LABS[t]})</div>)}</div></div>}
              {visit.service_type==="minor_procedure"&&<div className="fg"><label className="fl">Procedure</label><div className="sw"><select className="fs" value={visit.procedure} onChange={e=>uv("procedure",e.target.value)}>{Object.keys(PROCS).map(p=><option key={p}>{p}</option>)}</select><I.Chev/></div></div>}
              <div className="fr">
                <div className="fg"><label className="fl">Age</label><input className="fi" type="number" min="0" max="100" value={visit.age} onChange={e=>uv("age",Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}/></div>
                <div className="fg"><label className="fl">Gender</label><div className="sw"><select className="fs" value={visit.gender} onChange={e=>uv("gender",e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select><I.Chev/></div></div>
              </div>
              <div className="fr">
                <div className="fg"><label className="fl">Region</label><div className="sw"><select className="fs" value={visit.region} onChange={e=>uv("region",e.target.value)}>{Object.keys(RGN).map(r=><option key={r}>{r}</option>)}</select><I.Chev/></div></div>
                <div className="fg"><label className="fl">Facility</label><div className="sw"><select className="fs" value={visit.facility_type} onChange={e=>uv("facility_type",e.target.value)}>{Object.keys(FAC).map(f=><option key={f}>{f}</option>)}</select><I.Chev/></div></div>
              </div>
              <div className="fr">
                <div className="fg"><label className="fl">Chronic Conditions</label><input className="fi" type="number" min="0" max="10" value={visit.chronic_conditions} onChange={e=>uv("chronic_conditions",Math.max(0,Math.min(10,parseInt(e.target.value)||0)))}/></div>
                <div className="fg"><label className="fl">Insurance</label><div className="toggle-row"><button className={`toggle ${visit.has_insurance?"on":"off"}`} onClick={()=>uv("has_insurance",!visit.has_insurance)}/><span style={{fontSize:13,color:"var(--txt2)"}}>{visit.has_insurance?"Insured (-30%)":"No Insurance"}</span></div></div>
              </div>
            </>}

            {/* ─── ANNUAL MODE ─── */}
            {mode === "annual" && <>
              <div className="fg"><label className="fl">Plan Tier</label>
                <div className="chips">
                  {["Essential","Plus","Premium"].map(t=><div key={t} className={`chip ${annual.plan_tier===t?"sel":""}`} onClick={()=>ua("plan_tier",t)}>{t} — ${PLANS[t].base}/yr base</div>)}
                </div>
              </div>
              <div className="fr">
                <div className="fg"><label className="fl">Age</label><input className="fi" type="number" min="0" max="100" value={annual.age} onChange={e=>ua("age",Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}/></div>
                <div className="fg"><label className="fl">Gender</label><div className="sw"><select className="fs" value={annual.gender} onChange={e=>ua("gender",e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select><I.Chev/></div></div>
              </div>
              <div className="fr">
                <div className="fg"><label className="fl">Region</label><div className="sw"><select className="fs" value={annual.region} onChange={e=>ua("region",e.target.value)}>{Object.keys(RGN).map(r=><option key={r}>{r}</option>)}</select><I.Chev/></div></div>
                <div className="fg"><label className="fl">Family Size</label><input className="fi" type="number" min="1" max="10" value={annual.family_size} onChange={e=>ua("family_size",Math.max(1,Math.min(10,parseInt(e.target.value)||1)))}/></div>
              </div>
              <div className="fg"><label className="fl">Chronic Conditions</label><input className="fi" type="number" min="0" max="10" value={annual.chronic_conditions} onChange={e=>ua("chronic_conditions",Math.max(0,Math.min(10,parseInt(e.target.value)||0)))}/></div>
            </>}

            {/* ─── PACKAGE MODE ─── */}
            {mode === "package" && <>
              <div className="fg"><label className="fl">Package</label>
                <div className="chips">
                  {Object.entries(PKGS).map(([k,v])=><div key={k} className={`chip ${pkg.package_type===k?"sel":""}`} onClick={()=>up("package_type",k)}>{v.name} — ${v.base}</div>)}
                </div>
              </div>
              <div className="fr">
                <div className="fg"><label className="fl">Age</label><input className="fi" type="number" min="0" max="100" value={pkg.age} onChange={e=>up("age",Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}/></div>
                <div className="fg"><label className="fl">Gender</label><div className="sw"><select className="fs" value={pkg.gender} onChange={e=>up("gender",e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select><I.Chev/></div></div>
              </div>
              <div className="fg"><label className="fl">Region</label><div className="sw"><select className="fs" value={pkg.region} onChange={e=>up("region",e.target.value)}>{Object.keys(RGN).map(r=><option key={r}>{r}</option>)}</select><I.Chev/></div></div>
            </>}

            <button className="btn" onClick={calculate} disabled={loading}>
              {loading?<><I.Spin/> Calculating...</>:<>Get Price <I.Arrow/></>}
            </button>
          </div>

          {/* ─── RESULT ─── */}
          <div className="card result-card">
            <h3>Your estimate</h3>
            {result ? <>
              <div className="price-box">
                <div className="price-label">{result.mode==="visit"?"Visit Cost":result.mode==="annual"?"Annual Premium":"Package Cost"}</div>
                <div className="price-amount">${result.mode==="visit"?result.final_cost:result.mode==="annual"?result.annual_premium:result.total_cost}</div>
                {result.mode==="annual"&&<div className="price-sub">${result.monthly_premium}/month</div>}
                <div className="price-tag">{isLocal?"Local calc":`Model ${result.model_version}`}</div>
              </div>
              <div className="bk">
                <div className="bk-row"><span className="bk-l">Base Cost</span><span className="bk-v">${result.base_cost||result.breakdown?.plan_base||result.breakdown?.package_base||"—"}</span></div>
                <div className="bk-row"><span className="bk-l">Cost Multiplier</span><span className="bk-v hi">{result.cost_multiplier}x</span></div>
                {result.breakdown && Object.entries(result.breakdown).filter(([k])=>k.includes("factor")).map(([k,v])=>(
                  <div className="bk-row" key={k}><span className="bk-l">{k.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</span><span className="bk-v">{v}x</span></div>
                ))}
                {result.insurance_discount>0&&<div className="bk-row"><span className="bk-l">Insurance Discount</span><span className="bk-v" style={{color:"var(--pri)"}}>-${result.insurance_discount}</span></div>}
                {result.mode==="annual"&&result.breakdown?.family_factor&&<div className="bk-row"><span className="bk-l">Family ({result.breakdown.family_size} members)</span><span className="bk-v">{result.breakdown.family_factor}x</span></div>}
              </div>
              <div className="qid"><span>Quote ID</span><code>{result.quote_id}</code></div>
              {isLocal&&<div className="warn-box">Calculated locally — API unavailable</div>}
            </> : <div className="empty"><I.Steth/><p>Select a service and click<br/><strong>Get Price</strong></p></div>}
          </div>
        </div>
      </>}

      {/* ─── ADMIN PAGE ─── */}
      {page === "admin" && <AdminDashboard apiOk={apiOk} />}

      <footer className="footer">
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div className="nav-logo" style={{width:26,height:26,fontSize:10,borderRadius:6}}>Op</div>
          <span style={{fontFamily:"var(--fd)",fontSize:14,fontStyle:"italic"}}>OPD Pricing Platform</span>
        </div>
        <div className="footer-tags">
          <span className="footer-tag">FastAPI</span><span className="footer-tag">sklearn</span>
          <span className="footer-tag">Supabase</span><span className="footer-tag">Airflow</span>
          <span className="footer-tag">Vercel</span>
        </div>
        <p>Demo — Synthetic Data</p>
      </footer>
    </div></>
  );
}

// ─── Admin Dashboard Component ──────────────────────────────────────────────
function AdminDashboard({ apiOk }) {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [autoRetrain, setAutoRetrain] = useState(false);
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadHistory, setUploadHistory] = useState(null);
  const [modelHistory, setModelHistory] = useState(null);

  const loadHistory = async () => {
    try {
      const [uh, mh] = await Promise.all([
        api("/api/v1/admin/upload-history"),
        api("/api/v1/admin/model-history"),
      ]);
      setUploadHistory(uh); setModelHistory(mh);
    } catch { /* offline */ }
  };

  useEffect(() => { if (apiOk) loadHistory(); }, [apiOk]);

  const handleUpload = async (file) => {
    if (!file || !file.name.endsWith(".csv")) { alert("Please select a CSV file"); return; }
    setUploading(true); setUploadResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("description", description);
      form.append("auto_retrain", autoRetrain.toString());
      const r = await fetch(`${API}/api/v1/admin/upload-dataset`, { method: "POST", body: form, signal: AbortSignal.timeout(120000) });
      const data = await r.json();
      setUploadResult(data);
      if (data.status === "accepted") loadHistory();
    } catch (e) {
      setUploadResult({ status: "error", detail: e.message });
    } finally { setUploading(false); }
  };

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); };
  const onFileSelect = (e) => { const f = e.target.files[0]; if (f) handleUpload(f); };

  return (
    <div className="admin">
      <h2>Admin dashboard</h2>
      <p>Upload datasets, manage models, and control the retraining pipeline</p>
      <div className="admin-grid">

        {/* Upload Card */}
        <div className="admin-card full" style={{animation:"fadeUp .4s ease both"}}>
          <h4>Upload training data</h4>
          <p style={{fontSize:13,color:"var(--txt2)",marginBottom:16}}>
            Upload a CSV with claims data to retrain the pricing model. Required columns: patient_age, patient_gender, region, service_type, facility_type, chronic_count, billed_amount
          </p>

          <div
            onDragOver={e=>{e.preventDefault();setDragOver(true)}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={onDrop}
            style={{
              border:`2px dashed ${dragOver?"var(--pri)":"var(--surf3)"}`,
              borderRadius:"var(--r)", padding:"36px 24px", textAlign:"center",
              background:dragOver?"var(--pri-bg)":"var(--surf2)",
              transition:"all .2s", cursor:"pointer", marginBottom:16,
            }}
            onClick={()=>document.getElementById("file-input").click()}
          >
            <input id="file-input" type="file" accept=".csv" onChange={onFileSelect} style={{display:"none"}} />
            <div style={{fontSize:28,marginBottom:8,opacity:.4}}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <p style={{fontSize:14,color:"var(--txt2)",fontWeight:500}}>
              {uploading ? "Uploading & processing..." : "Drag & drop a CSV file here, or click to browse"}
            </p>
            <p style={{fontSize:12,color:"var(--txt3)",marginTop:4}}>Max 50 MB. Must include required columns.</p>
          </div>

          <div className="fr" style={{marginBottom:12}}>
            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">Description (optional)</label>
              <input className="fi" placeholder="e.g. Q1 2026 claims data" value={description} onChange={e=>setDescription(e.target.value)} />
            </div>
            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">Auto-retrain after upload</label>
              <div className="toggle-row" style={{marginTop:4}}>
                <button className={`toggle ${autoRetrain?"on":"off"}`} onClick={()=>setAutoRetrain(!autoRetrain)} />
                <span style={{fontSize:13,color:"var(--txt2)"}}>{autoRetrain?"Yes — train new model immediately":"No — upload only"}</span>
              </div>
            </div>
          </div>

          <div style={{display:"flex",gap:8}}>
            <a href={`${API}/api/v1/admin/dataset-template`} download style={{textDecoration:"none"}}>
              <button className="btn-sm" type="button">Download CSV template</button>
            </a>
          </div>

          {/* Upload Result */}
          {uploadResult && (
            <div style={{
              marginTop:16, padding:16, borderRadius:"var(--rs)",
              background: uploadResult.status === "accepted" ? "var(--pri-bg)" : uploadResult.status === "rejected" ? "#fef2f2" : "#fffbeb",
              border: `1px solid ${uploadResult.status === "accepted" ? "rgba(13,148,136,.2)" : uploadResult.status === "rejected" ? "#fecaca" : "#fef3c7"}`,
            }}>
              <div style={{fontWeight:600,fontSize:14,marginBottom:8,color:uploadResult.status==="accepted"?"var(--pri)":"#dc2626"}}>
                {uploadResult.status === "accepted" ? "Dataset accepted" : uploadResult.status === "rejected" ? "Dataset rejected" : "Upload error"}
              </div>

              {uploadResult.status === "accepted" && <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                  <div style={{background:"white",padding:10,borderRadius:8,textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:600,color:"var(--txt)"}}>{uploadResult.rows_parsed}</div>
                    <div style={{fontSize:11,color:"var(--txt3)"}}>Rows parsed</div>
                  </div>
                  <div style={{background:"white",padding:10,borderRadius:8,textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:600,color:"var(--pri)"}}>{uploadResult.rows_inserted_to_db}</div>
                    <div style={{fontSize:11,color:"var(--txt3)"}}>Inserted to DB</div>
                  </div>
                  <div style={{background:"white",padding:10,borderRadius:8,textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:600,color:uploadResult.issues?.length?"#f59e0b":"var(--pri)"}}>{uploadResult.issues?.length||0}</div>
                    <div style={{fontSize:11,color:"var(--txt3)"}}>Warnings</div>
                  </div>
                </div>

                {uploadResult.issues?.length > 0 && (
                  <div style={{fontSize:12,color:"#92400e",marginBottom:8}}>
                    {uploadResult.issues.map((iss,i)=><div key={i} style={{marginBottom:2}}>⚠ {iss}</div>)}
                  </div>
                )}

                {uploadResult.retrain_result && (
                  <div style={{padding:10,background:"white",borderRadius:8,marginTop:8}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--pri)",marginBottom:4}}>
                      Model retrained: {uploadResult.retrain_result.new_version}
                    </div>
                    <div style={{fontSize:12,color:"var(--txt2)"}}>
                      R² = {uploadResult.retrain_result.r2} | RMSE = {uploadResult.retrain_result.rmse} | {uploadResult.retrain_result.training_rows} rows
                    </div>
                  </div>
                )}
              </>}

              {uploadResult.status === "rejected" && <>
                <p style={{fontSize:13,color:"#dc2626",marginBottom:6}}>{uploadResult.detail}</p>
                {uploadResult.required_columns && (
                  <div style={{fontSize:12,color:"var(--txt2)"}}>
                    Required: <code style={{background:"var(--surf2)",padding:"1px 4px",borderRadius:3}}>{uploadResult.required_columns.join(", ")}</code>
                  </div>
                )}
              </>}

              {uploadResult.status === "error" && <p style={{fontSize:13,color:"#dc2626"}}>{uploadResult.detail}</p>}
            </div>
          )}
        </div>

        {/* Model Status */}
        <div className="admin-card">
          <h4>Model status</h4>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div className="bk-row"><span className="bk-l">Version</span><span className="bk-v">{apiOk?"v1.0.0":"—"}</span></div>
            <div className="bk-row"><span className="bk-l">Status</span><span className="bk-v hi">{apiOk?"Active":"Offline"}</span></div>
            <div className="bk-row"><span className="bk-l">Type</span><span className="bk-v">GradientBoosting</span></div>
            <div className="bk-row"><span className="bk-l">Features</span><span className="bk-v" style={{fontSize:11}}>age, gender, region, service, chronic, facility</span></div>
          </div>
        </div>

        {/* Database */}
        <div className="admin-card">
          <h4>Database</h4>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div className="bk-row"><span className="bk-l">Connection</span><span className="bk-v hi">{apiOk?"Connected":"Disconnected"}</span></div>
            <div className="bk-row"><span className="bk-l">Provider</span><span className="bk-v">Supabase PostgreSQL</span></div>
            <div className="bk-row"><span className="bk-l">Tables</span><span className="bk-v">5 (quotes, rates, claims, models, runs)</span></div>
          </div>
        </div>

        {/* Upload History */}
        {uploadHistory?.uploads?.length > 0 && (
          <div className="admin-card">
            <h4>Upload history</h4>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {uploadHistory.uploads.map((u,i) => (
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--surf2)"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:500}}>{u.batch_id}</div>
                    <div style={{fontSize:11,color:"var(--txt3)"}}>{u.rows} rows | avg ${u.avg_amount}</div>
                  </div>
                  <div style={{fontSize:11,color:"var(--txt3)"}}>{u.uploaded_at?.slice(0,10)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Model History */}
        {modelHistory?.models?.length > 0 && (
          <div className="admin-card">
            <h4>Model versions</h4>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {modelHistory.models.map((m,i) => (
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--surf2)"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:500}}>{m.version}</div>
                    <div style={{fontSize:11,color:"var(--txt3)"}}>R²={m.r2} | RMSE={m.rmse} | {m.training_rows} rows</div>
                  </div>
                  <span style={{
                    padding:"3px 8px",borderRadius:100,fontSize:11,fontWeight:600,
                    background:m.status==="active"?"var(--pri-bg)":"var(--surf2)",
                    color:m.status==="active"?"var(--pri)":"var(--txt3)",
                  }}>{m.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Airflow Pipeline */}
        <div className="admin-card full">
          <h4>Airflow retraining pipeline</h4>
          <p style={{fontSize:13,color:"var(--txt2)",marginBottom:16}}>DAG: <code style={{background:"var(--surf2)",padding:"2px 6px",borderRadius:4,fontSize:12}}>opd_retrain_pipeline</code> — scheduled monthly, 1st at 2 AM</p>
          <div className="pipeline">
            {[
              {n:"1",name:"Extract",desc:"Pull 6mo claims from DB"},
              {n:"2",name:"Validate",desc:"Schema + quality checks"},
              {n:"3",name:"Train",desc:"GBR model fit"},
              {n:"4",name:"Evaluate",desc:"Champion vs challenger"},
              {n:"5",name:"Promote",desc:"Deploy to production"},
              {n:"6",name:"Notify",desc:"Alert team of result"},
            ].map(s=><div className="pipe-step" key={s.n}><div className="pipe-step-num">Step {s.n}</div><div className="pipe-step-name">{s.name}</div><div className="pipe-step-desc">{s.desc}</div></div>)}
          </div>
          <div style={{marginTop:16,display:"flex",gap:10}}>
            <button className="btn-sm" onClick={async()=>{try{const r=await api("/api/v1/admin/trigger-retrain",{});alert(`Retrain ${r.status}`)}catch{alert("Airflow not reachable — configure AIRFLOW_BASE_URL")}}}><I.Refresh/> Trigger Retrain</button>
            <button className="btn-sm" onClick={async()=>{try{const r=await api("/api/v1/admin/retrain-status");alert(JSON.stringify(r,null,2))}catch{alert("Airflow not reachable")}}}><I.Settings/> Check Status</button>
          </div>
        </div>
      </div>
    </div>
  );
}