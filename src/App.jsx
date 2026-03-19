import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG — Update these for your deployment
// ═══════════════════════════════════════════════════════════════════════════════
const API = "https://opd-backend-685i.onrender.com";

// Logo: replace with your actual logo URL or import
// Option 1: URL
const LOGO_URL = "/DAC.jpg"; // e.g. "https://yourdomain.com/logo.png"
// Option 2: If using a local file, put logo.png in /public and use "/logo.png"
// Option 3: Set to null to use the built-in text logo

// ═══════════════════════════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════════════════════════
async function apiCall(path, body) {
  const opts = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {};
  const r = await fetch(`${API}${path}`, { ...opts, signal: AbortSignal.timeout(45000) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Error ${r.status}`); }
  return r.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPD FALLBACK DATA
// ═══════════════════════════════════════════════════════════════════════════════
const RGN = {"Phnom Penh":1.20,"Siem Reap":1.05,"Battambang":0.90,"Sihanoukville":1.10,"Kampong Cham":0.85,"Rural Areas":0.75};
const FAC = {"Public Hospital":0.60,"Private Hospital":1.00,"Clinic":0.80,"Specialist Center":1.25};
const SPEC = {"General Practice":25,"Internal Medicine":40,"Cardiology":65,"Orthopedics":60,"Dermatology":45,"ENT":50,"Ophthalmology":55,"Neurology":70,"Pediatrics":35,"Gynecology":50,"Urology":55,"Gastroenterology":60};
const LABS = {"Complete Blood Count":15,"Blood Chemistry Panel":25,"Urinalysis":10,"Lipid Panel":20,"Thyroid Function":30,"HbA1c":18,"Liver Function":22,"Kidney Function":22,"X-Ray":35,"Ultrasound":50,"ECG":25,"CT Scan":150,"MRI":280};
const PROCS = {"Wound Care":40,"Minor Excision":120,"Joint Injection":80,"Abscess Drainage":90,"Endoscopy":250,"Colonoscopy":300,"Biopsy":180,"Cast Application":70,"Fracture Reduction":200,"Foreign Body Removal":60};
const OPD_PLANS = {Essential:{base:180,visits:12,lab:100,proc:0},Plus:{base:380,visits:24,lab:300,proc:200},Premium:{base:650,visits:999,lab:800,proc:600}};
const PKGS = {health_screening:{name:"Health Screening",base:120},chronic_care:{name:"Chronic Care (6mo)",base:280},maternity:{name:"Maternity OPD",base:450},executive_checkup:{name:"Executive Checkup",base:350}};
const ageFactor = a => a<=5?1.15:a<=17?0.90:a<=30?0.95:a<=45?1.00:a<=60?1.15:1.35;

function localOpdVisit(inp) {
  let base = 25;
  if (inp.service_type === "specialist_visit") base = SPEC[inp.specialty] || 55;
  else if (inp.service_type === "lab_test") base = (inp.lab_tests||[]).reduce((s,t) => s + (LABS[t]||20), 0);
  else if (inp.service_type === "minor_procedure") base = PROCS[inp.procedure] || 60;
  const m = Math.round(ageFactor(inp.age) * (RGN[inp.region]||1) * (FAC[inp.facility_type]||1) * (1+inp.chronic_conditions*0.08) * 1000) / 1000;
  const sub = Math.round(base * m * 100) / 100;
  const disc = inp.has_insurance ? Math.round(sub * 0.30 * 100) / 100 : 0;
  return { quote_id: `LOCAL-${Date.now()}`, base_cost: base, cost_multiplier: m, subtotal: sub, insurance_discount: disc, final_cost: Math.round((sub-disc)*100)/100, model_version: "local", breakdown: { age_factor: ageFactor(inp.age), region_factor: RGN[inp.region]||1, facility_factor: FAC[inp.facility_type]||1 } };
}
function localOpdAnnual(inp) {
  const p = OPD_PLANS[inp.plan_tier] || OPD_PLANS.Essential;
  const m = Math.round(ageFactor(inp.age) * (RGN[inp.region]||1) * (1+inp.chronic_conditions*0.08) * 1000) / 1000;
  const ff = 1 + (inp.family_size-1)*0.65;
  const ann = Math.round(p.base * m * ff * 100) / 100;
  return { quote_id: `LOCAL-${Date.now()}`, plan_tier: inp.plan_tier, annual_premium: ann, monthly_premium: Math.round(ann/12*100)/100, cost_multiplier: m, model_version: "local", plan_benefits: p, breakdown: { plan_base: p.base, family_factor: Math.round(ff*100)/100 } };
}
function localOpdPackage(inp) {
  const pk = PKGS[inp.package_type] || PKGS.health_screening;
  const m = Math.round(ageFactor(inp.age) * (RGN[inp.region]||1) * 1000) / 1000;
  return { quote_id: `LOCAL-${Date.now()}`, package_name: pk.name, base_cost: pk.base, total_cost: Math.round(pk.base*m*100)/100, cost_multiplier: m, model_version: "local", breakdown: {} };
}

// ═══════════════════════════════════════════════════════════════════════════════
// IPD FALLBACK DATA
// ═══════════════════════════════════════════════════════════════════════════════
const IPD_WARD = {"General Ward":1.00,"Semi-Private":1.60,"Private Room":2.20,"ICU":4.50,"NICU":5.00};
const IPD_SURGERY = {
  "Appendectomy":1200,"Hernia Repair":1500,"Cholecystectomy":1800,"C-Section":2200,
  "Knee Replacement":8500,"Hip Replacement":9000,"Cardiac Bypass":15000,"Angioplasty":6000,
  "Spinal Fusion":12000,"Hysterectomy":3500,"Tonsillectomy":800,"Cataract Surgery":1200,
};
const IPD_PLANS = {
  Standard: {base:800, room:"General Ward", surgery_limit:5000, icu_days:3, annual_limit:15000},
  Enhanced: {base:1600, room:"Semi-Private", surgery_limit:15000, icu_days:7, annual_limit:40000},
  Elite:    {base:3200, room:"Private Room", surgery_limit:50000, icu_days:14, annual_limit:100000},
};
const IPD_PACKAGES = {
  maternity_delivery: {name:"Maternity & Delivery", base:2800, includes:["Normal/C-Section delivery","3-night stay","Newborn care","Anesthesia","Lab work"]},
  cardiac_care:       {name:"Cardiac Care", base:5500, includes:["Angioplasty or bypass","5-night ICU","Post-op monitoring","Cardiac rehab (4 sessions)","All diagnostics"]},
  orthopedic:         {name:"Joint Replacement", base:7000, includes:["Knee or hip replacement","Implant cost","5-night stay","Physiotherapy (10 sessions)","Follow-up visits x3"]},
  general_surgery:    {name:"General Surgery", base:2000, includes:["Appendectomy/hernia/cholecystectomy","2-night stay","Anesthesia","Post-op care","Follow-up visit"]},
};

function localIpdAdmission(inp) {
  const ward = IPD_WARD[inp.ward_type] || 1.0;
  const surgCost = inp.surgery_type ? (IPD_SURGERY[inp.surgery_type] || 1500) : 0;
  const baseCost = (inp.los_days || 3) * 150 * ward + surgCost;
  const m = Math.round(ageFactor(inp.age) * (RGN[inp.region]||1) * (1 + (inp.comorbidities||0)*0.10) * 1000) / 1000;
  const total = Math.round(baseCost * m * 100) / 100;
  const disc = inp.has_insurance ? Math.round(total * 0.25 * 100) / 100 : 0;
  return { quote_id:`LOCAL-${Date.now()}`, base_cost:Math.round(baseCost), cost_multiplier:m, subtotal:total, insurance_discount:disc, final_cost:Math.round((total-disc)*100)/100, model_version:"local", breakdown:{ward_factor:ward, age_factor:ageFactor(inp.age), region_factor:RGN[inp.region]||1, comorbidity_factor:Math.round((1+(inp.comorbidities||0)*0.10)*100)/100, daily_rate:Math.round(150*ward), surgery_cost:surgCost, los_days:inp.los_days||3} };
}
function localIpdAnnual(inp) {
  const p = IPD_PLANS[inp.plan_tier] || IPD_PLANS.Standard;
  const m = Math.round(ageFactor(inp.age) * (RGN[inp.region]||1) * (1+(inp.comorbidities||0)*0.10) * 1000) / 1000;
  const ff = 1 + (inp.family_size-1)*0.70;
  const ann = Math.round(p.base * m * ff * 100) / 100;
  return { quote_id:`LOCAL-${Date.now()}`, plan_tier:inp.plan_tier, annual_premium:ann, monthly_premium:Math.round(ann/12*100)/100, cost_multiplier:m, model_version:"local", plan_benefits:p, breakdown:{plan_base:p.base, family_factor:Math.round(ff*100)/100} };
}
function localIpdPackage(inp) {
  const pk = IPD_PACKAGES[inp.package_type] || IPD_PACKAGES.general_surgery;
  const m = Math.round(ageFactor(inp.age) * (RGN[inp.region]||1) * 1000) / 1000;
  return { quote_id:`LOCAL-${Date.now()}`, package_name:pk.name, package_includes:pk.includes, base_cost:pk.base, total_cost:Math.round(pk.base*m*100)/100, cost_multiplier:m, model_version:"local", breakdown:{} };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════
const I = {
  Steth: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.8 2.3A8 8 0 1 0 20 12"/><path d="M12 12v6a4 4 0 0 0 8 0v-1"/><circle cx="20" cy="14" r="2"/></svg>,
  Flask: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3h6M10 3v7.5L4 18.5A2 2 0 0 0 5.5 22h13a2 2 0 0 0 1.5-3.5L14 10.5V3"/></svg>,
  Scissors: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  Calendar: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Package: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  Bed: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg>,
  Heart: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>,
  Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Chev: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
  Arrow: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Spin: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>,
  Refresh: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  ArrowRight: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOGO COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function Logo({ size = 34 }) {
  if (LOGO_URL) {
    return <img src={LOGO_URL} alt="Logo" style={{ width: size, height: size, borderRadius: size * 0.26, objectFit: "contain" }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.26,
      background: "linear-gradient(135deg, var(--pri) 0%, var(--acc) 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", fontFamily: "var(--fd)", fontWeight: 400,
      fontSize: size * 0.38, fontStyle: "italic", letterSpacing: -0.5,
    }}>
      HP
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Instrument+Serif:ital@0;1&display=swap');
:root {
  --pri:#0d9488; --pri-l:#14b8a6; --pri-d:#0f766e; --pri-bg:#f0fdfa;
  --acc:#6366f1; --acc-bg:#eef2ff;
  --ipd:#7c3aed; --ipd-l:#8b5cf6; --ipd-bg:#f5f3ff;
  --warn:#f59e0b; --danger:#ef4444;
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
.nav-title{font-family:var(--fd);font-size:18px;color:var(--txt);font-style:italic}
.nav-links{display:flex;gap:4px;align-items:center}
.nav-link{padding:7px 14px;border-radius:8px;font-size:13px;font-weight:500;color:var(--txt2);cursor:pointer;border:none;background:none;font-family:var(--fb);transition:all .2s}
.nav-link:hover{color:var(--pri);background:var(--pri-bg)}
.nav-link.active{color:var(--pri);background:var(--pri-bg);font-weight:600}
.nav-link.ipd-active{color:var(--ipd);background:var(--ipd-bg);font-weight:600}
.status{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:100px;font-size:11px;font-weight:600}
.status.ok{background:rgba(13,148,136,.08);color:var(--pri)}
.status.off{background:rgba(239,68,68,.08);color:var(--danger)}
.dot{width:6px;height:6px;border-radius:50%}
.dot.ok{background:var(--pri)} .dot.off{background:var(--danger)}

/* Landing */
.landing{max-width:1060px;margin:0 auto;padding:60px 28px}
.landing-hero{text-align:center;margin-bottom:56px}
.landing-hero h1{font-family:var(--fd);font-size:44px;font-weight:400;font-style:italic;line-height:1.12;letter-spacing:-.5px;margin-bottom:12px}
.landing-hero h1 span{color:var(--pri)}
.landing-hero p{font-size:17px;color:var(--txt2);max-width:520px;margin:0 auto;line-height:1.55}
.landing-cards{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.lcard{background:var(--surf);border-radius:20px;border:1.5px solid var(--surf3);padding:36px 32px;cursor:pointer;transition:all .25s;position:relative;overflow:hidden}
.lcard:hover{transform:translateY(-4px);box-shadow:var(--shm)}
.lcard.opd{border-color:rgba(13,148,136,.15)} .lcard.opd:hover{border-color:var(--pri);box-shadow:0 8px 30px rgba(13,148,136,.12)}
.lcard.ipd{border-color:rgba(124,58,237,.15)} .lcard.ipd:hover{border-color:var(--ipd);box-shadow:0 8px 30px rgba(124,58,237,.12)}
.lcard-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:100px;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:16px}
.lcard.opd .lcard-badge{background:var(--pri-bg);color:var(--pri)}
.lcard.ipd .lcard-badge{background:var(--ipd-bg);color:var(--ipd)}
.lcard h3{font-family:var(--fd);font-size:26px;font-weight:400;font-style:italic;margin-bottom:8px}
.lcard p{font-size:14px;color:var(--txt2);line-height:1.55;margin-bottom:20px}
.lcard-features{display:flex;flex-direction:column;gap:8px;margin-bottom:24px}
.lcard-feat{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt2)}
.lcard-feat::before{content:'';width:6px;height:6px;border-radius:50%;flex-shrink:0}
.lcard.opd .lcard-feat::before{background:var(--pri)}
.lcard.ipd .lcard-feat::before{background:var(--ipd)}
.lcard-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:var(--rs);font-size:13px;font-weight:600;border:none;cursor:pointer;font-family:var(--fb);transition:all .2s;color:white}
.lcard.opd .lcard-btn{background:var(--pri)} .lcard.opd .lcard-btn:hover{background:var(--pri-d)}
.lcard.ipd .lcard-btn{background:var(--ipd)} .lcard.ipd .lcard-btn:hover{background:#6d28d9}

/* Hero */
.hero{padding:44px 28px 36px;max-width:1060px;margin:0 auto;text-align:center}
.hero-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:100px;font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;margin-bottom:14px}
.hero-badge.opd{color:var(--pri);background:var(--pri-bg)}
.hero-badge.ipd{color:var(--ipd);background:var(--ipd-bg)}
.hero h1{font-family:var(--fd);font-size:36px;font-weight:400;font-style:italic;line-height:1.15;letter-spacing:-.5px;margin-bottom:10px}
.hero h1 .opd-hi{color:var(--pri)} .hero h1 .ipd-hi{color:var(--ipd)}
.hero p{font-size:16px;color:var(--txt2);max-width:480px;margin:0 auto;line-height:1.55}

/* Tabs, Form, Results — shared */
.tabs{display:flex;gap:6px;justify-content:center;margin-bottom:28px;padding:0 28px;flex-wrap:wrap}
.tab{display:flex;align-items:center;gap:7px;padding:10px 20px;border-radius:var(--rs);font-size:13px;font-weight:500;color:var(--txt2);cursor:pointer;border:1.5px solid var(--surf3);background:white;font-family:var(--fb);transition:all .2s}
.tab:hover{border-color:var(--pri-l);color:var(--pri)}
.tab.active{border-color:var(--pri);background:var(--pri-bg);color:var(--pri);font-weight:600}
.tab.ipd-active{border-color:var(--ipd);background:var(--ipd-bg);color:var(--ipd);font-weight:600}

.main{max-width:1060px;margin:0 auto;padding:0 28px 48px;display:grid;grid-template-columns:1fr 1fr;gap:24px}
.card{background:var(--surf);border-radius:var(--r);border:1px solid var(--surf3);box-shadow:var(--sh);animation:fadeUp .4s ease both}
.form-card{padding:28px} .form-card h3{font-family:var(--fd);font-size:19px;font-weight:400;font-style:italic;margin-bottom:20px}
.result-card{padding:28px;display:flex;flex-direction:column} .result-card h3{font-family:var(--fd);font-size:19px;font-weight:400;font-style:italic;margin-bottom:16px}

.fg{margin-bottom:18px} .fl{display:block;font-size:11px;font-weight:600;color:var(--txt2);margin-bottom:5px;letter-spacing:.3px;text-transform:uppercase}
.fi,.fs{width:100%;padding:10px 13px;border-radius:var(--rs);border:1.5px solid var(--surf3);font-size:14px;font-family:var(--fb);color:var(--txt);background:white;transition:all .2s;outline:none;appearance:none}
.fi:focus,.fs:focus{border-color:var(--pri);box-shadow:0 0 0 3px rgba(13,148,136,.08)}
.sw{position:relative} .sw svg{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--txt3)}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:12px}

.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{padding:6px 12px;border-radius:8px;font-size:12px;font-weight:500;border:1.5px solid var(--surf3);cursor:pointer;transition:all .15s;background:white;font-family:var(--fb);color:var(--txt2)}
.chip:hover{border-color:var(--pri-l)}
.chip.sel{border-color:var(--pri);background:var(--pri-bg);color:var(--pri)}
.chip.ipd-sel{border-color:var(--ipd);background:var(--ipd-bg);color:var(--ipd)}

.toggle-row{display:flex;align-items:center;gap:10px}
.toggle{width:40px;height:22px;border-radius:11px;border:none;cursor:pointer;position:relative;transition:all .2s}
.toggle.off{background:var(--surf3)} .toggle.on{background:var(--pri)}
.toggle::after{content:'';position:absolute;top:2px;width:18px;height:18px;border-radius:50%;background:white;transition:all .2s;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.toggle.off::after{left:2px} .toggle.on::after{left:20px}

.btn{width:100%;padding:13px;border-radius:var(--rs);font-size:14px;font-weight:600;color:white;border:none;cursor:pointer;transition:all .2s;font-family:var(--fb);display:flex;align-items:center;justify-content:center;gap:7px;margin-top:6px}
.btn.opd-btn{background:var(--pri);box-shadow:0 2px 10px rgba(13,148,136,.25)} .btn.opd-btn:hover{background:var(--pri-d)}
.btn.ipd-btn{background:var(--ipd);box-shadow:0 2px 10px rgba(124,58,237,.25)} .btn.ipd-btn:hover{background:#6d28d9}
.btn:disabled{opacity:.6;cursor:not-allowed;transform:none}

.price-box{border-radius:14px;padding:28px;color:white;margin-bottom:20px;position:relative;overflow:hidden}
.price-box::before{content:'';position:absolute;top:-40px;right:-20px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.06)}
.price-box.opd-box{background:linear-gradient(135deg,var(--pri) 0%,#0d9488 50%,#0891b2 100%)}
.price-box.ipd-box{background:linear-gradient(135deg,var(--ipd) 0%,#7c3aed 50%,#6366f1 100%)}
.price-label{font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.8px;font-weight:500}
.price-amount{font-family:var(--fd);font-size:44px;font-weight:400;font-style:italic;margin:4px 0;position:relative;z-index:1}
.price-sub{font-size:13px;opacity:.75}
.price-tag{display:inline-flex;align-items:center;gap:4px;margin-top:10px;padding:3px 9px;border-radius:6px;background:rgba(255,255,255,.15);font-size:11px;font-weight:500}

.bk{display:flex;flex-direction:column;gap:0;flex:1}
.bk-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--surf2)}
.bk-row:last-child{border-bottom:none}
.bk-l{font-size:13px;color:var(--txt2)} .bk-v{font-size:13px;font-weight:600;color:var(--txt)}
.bk-v.hi{color:var(--pri)} .bk-v.ipd-hi{color:var(--ipd)}

.qid{margin-top:14px;padding-top:14px;border-top:1px solid var(--surf3);display:flex;justify-content:space-between;align-items:center}
.qid span:first-child{font-size:10px;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.qid code{font-size:11px;color:var(--txt2);background:var(--surf2);padding:2px 7px;border-radius:5px}

.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:36px 16px;color:var(--txt3)}
.empty p{font-size:13px;line-height:1.5;margin-top:8px}
.warn-box{padding:8px 12px;border-radius:var(--rs);background:#fffbeb;border:1px solid #fef3c7;color:#92400e;font-size:11px;margin-top:10px;display:flex;align-items:center;gap:5px}
.back-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:500;color:var(--txt2);cursor:pointer;border:1px solid var(--surf3);background:white;font-family:var(--fb);transition:all .2s;margin-bottom:16px}
.back-btn:hover{background:var(--surf2)}

.includes-list{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.inc-item{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--txt2)}
.inc-dot{width:5px;height:5px;border-radius:50%;background:var(--ipd);flex-shrink:0}

/* Footer */
.footer{padding:28px;max-width:1060px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--surf3);flex-wrap:wrap;gap:12px}
.footer p{font-size:11px;color:var(--txt3)}
.footer-tags{display:flex;gap:5px}
.footer-tag{padding:2px 8px;border-radius:5px;font-size:10px;font-weight:600;background:var(--surf2);color:var(--txt3)}

@media(max-width:768px){.main{grid-template-columns:1fr}.landing-cards{grid-template-columns:1fr}.hero h1{font-size:28px}.tabs{flex-direction:column;align-items:stretch}.nav-links{display:none}.landing-hero h1{font-size:32px}}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// COUNTRY DATA (mirrors backend products.py for local display)
// ═══════════════════════════════════════════════════════════════════════════════
const COUNTRIES = {
  cambodia: {
    name: "Cambodia", code: "KH", flag: "\u{1F1F0}\u{1F1ED}", currency: "$",
    regions: Object.keys(RGN),
    market: { spend: "$122/capita", oop: "55%", uhc: 58, note: "Heavily privatized. 60% prefer private facilities. Many travel to Thailand/Singapore for major procedures." },
    products: [
      { id: "opd_visit", cat: "OPD", name: "Per-Visit Pricing", desc: "Consultations, lab tests, minor procedures", icon: "steth", features: ["12 specialties", "13 lab tests", "10 procedures", "Insurance discount 30%"] },
      { id: "opd_annual", cat: "OPD", name: "Annual OPD Plan", desc: "Essential / Plus / Premium tiers", icon: "calendar", features: ["$180–$650/yr base", "12 to unlimited visits", "Lab + procedure allowances"] },
      { id: "opd_pkg", cat: "OPD", name: "OPD Care Packages", desc: "Bundled care: screening, chronic, maternity, executive", icon: "package", features: ["4 package types", "15% bundle discount on add-ons", "Fixed pricing"] },
      { id: "ipd_admission", cat: "IPD", name: "Per-Admission Pricing", desc: "Hospital stays, surgeries, ICU", icon: "bed", features: ["5 ward types (General to NICU)", "12 surgery categories", "Length-of-stay modeling"] },
      { id: "ipd_annual", cat: "IPD", name: "Annual IPD Plan", desc: "Standard / Enhanced / Elite tiers", icon: "heart", features: ["$800–$3,200/yr base", "Surgery limits $5K–$50K", "Med-evac in Enhanced/Elite"] },
      { id: "ipd_pkg", cat: "IPD", name: "Surgical Packages", desc: "Maternity, cardiac, orthopedic, general surgery", icon: "package", features: ["4 packages", "All-inclusive pricing", "$2,000–$7,000 range"] },
      { id: "dental", cat: "Optional", name: "Dental Add-on", desc: "Cleanings, fillings, extractions", icon: "steth", features: ["$500 annual limit", "$120/yr premium"] },
      { id: "maternity", cat: "Optional", name: "Maternity Add-on", desc: "Prenatal to delivery coverage", icon: "heart", features: ["$5,000 annual limit", "10-month waiting period"] },
    ],
  },
  vietnam: {
    name: "Vietnam", code: "VN", flag: "\u{1F1FB}\u{1F1F3}", currency: "$",
    regions: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Can Tho", "Hai Phong", "Rural Areas"],
    market: { spend: "$190/capita", oop: "40%", uhc: 68, shi: "93% coverage via SHI (4.5% salary)", note: "Dual system: mandatory Social Health Insurance (SHI) at public facilities + voluntary Private Health Insurance (PHI). PHI popular with expats and high-income." },
    products: [
      { id: "opd_visit", cat: "OPD", name: "Per-Visit Pricing", desc: "Private facility consultations (supplements SHI)", icon: "steth", features: ["12 specialties", "13 lab tests + vaccination", "Prescription meds included", "SHI covers 80% at public"] },
      { id: "opd_annual", cat: "OPD", name: "Annual OPD Plan", desc: "Essential / Plus / Premium — supplements SHI", icon: "calendar", features: ["$220–$780/yr base", "20% co-insurance (waived at panel)", "Vaccination in Plus/Premium"] },
      { id: "opd_pkg", cat: "OPD", name: "OPD Care Packages", desc: "Screening, chronic care, maternity, executive", icon: "package", features: ["4 packages", "Includes NIPT screening", "Dietitian + lactation support"] },
      { id: "ipd_admission", cat: "IPD", name: "Per-Admission Pricing", desc: "Private hospital stays and surgeries", icon: "bed", features: ["5 ward types", "12 surgeries", "$540–$25,000 range", "SHI covers 80% at public"] },
      { id: "ipd_annual", cat: "IPD", name: "Annual IPD Plan", desc: "Standard / Enhanced / Elite", icon: "heart", features: ["$950–$3,800/yr base", "Surgery limits $6K–$60K", "Med-evac in Elite tier"] },
      { id: "ipd_pkg", cat: "IPD", name: "Surgical Packages", desc: "Maternity, cardiac, orthopedic, general — at FV, Vinmec, etc.", icon: "package", features: ["4 packages", "Imported implants included", "$2,400–$8,200 range"] },
      { id: "dental", cat: "Optional", name: "Dental Add-on", desc: "Preventive + basic procedures", icon: "steth", features: ["$600 annual limit", "$140/yr", "Root canal (partial)"] },
      { id: "maternity", cat: "Optional", name: "Maternity Add-on", desc: "Private facility maternity", icon: "heart", features: ["$6,000 limit", "NIPT/amnio included", "Newborn 60-day coverage"] },
      { id: "vision", cat: "Optional", name: "Vision/Optical", desc: "Eye exams + corrective lenses", icon: "steth", features: ["$300 limit", "$80/yr", "Glaucoma screening"] },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("landing"); // landing | opd | ipd | admin
  const [country, setCountry] = useState("cambodia");
  const [apiOk, setApiOk] = useState(null);
  const [productCatalog, setProductCatalog] = useState(null);

  useEffect(() => {
    apiCall("/health").then(() => setApiOk(true)).catch(() => setApiOk(false));
  }, []);

  // Fetch product catalog from backend when country changes
  useEffect(() => {
    apiCall(`/api/v1/products/${country}`)
      .then(data => setProductCatalog(data))
      .catch(() => setProductCatalog(null)); // fallback to local COUNTRIES data
  }, [country]);

  const countryData = COUNTRIES[country];
  const iconMap = { steth: <I.Steth/>, calendar: <I.Calendar/>, package: <I.Package/>, bed: <I.Bed/>, heart: <I.Heart/> };

  return (
    <><style>{CSS}</style>
    <div className="app">
      {/* ─── NAV ─── */}
      <nav className="nav">
        <div className="nav-brand" onClick={() => setPage("landing")}>
          <Logo size={34} />
          <span className="nav-title">DAC HealthPrice</span>
        </div>
        <div className="nav-links">
          <button className={`nav-link ${page==="landing"?"active":""}`} onClick={() => setPage("landing")}>Home</button>
          <button className={`nav-link ${page==="opd"?"active":""}`} onClick={() => setPage("opd")}>OPD</button>
          <button className={`nav-link ${page==="ipd"?"ipd-active":""}`} onClick={() => setPage("ipd")}>IPD</button>
          <button className={`nav-link ${page==="admin"?"active":""}`} onClick={() => setPage("admin")}>Admin</button>
          {/* Country Selector */}
          <div style={{display:"flex",gap:2,marginLeft:8,padding:2,background:"var(--surf2)",borderRadius:8}}>
            {Object.entries(COUNTRIES).map(([k,v]) => (
              <button key={k} onClick={() => setCountry(k)} style={{
                padding:"5px 10px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:country===k?600:400,
                background:country===k?"white":"transparent",color:country===k?"var(--txt)":"var(--txt3)",
                boxShadow:country===k?"0 1px 3px rgba(0,0,0,.08)":"none",transition:"all .2s",fontFamily:"var(--fb)",
              }}>{v.flag} {v.code}</button>
            ))}
          </div>
        </div>
        <div className={`status ${apiOk?"ok":"off"}`}>
          <div className={`dot ${apiOk?"ok":"off"}`}/>{apiOk?"API Connected":"Offline Mode"}
        </div>
      </nav>

      {/* ─── LANDING PAGE ─── */}
      {page === "landing" && (
        <div className="landing" style={{animation:"fadeUp .5s ease both"}}>
          <div className="landing-hero">
            <div style={{display:"flex",justifyContent:"center",marginBottom:20}}><Logo size={56} /></div>
            <h1>DAC HealthPrice,<br/><span>Powered by AI</span></h1>
            <p>Instant, transparent pricing for outpatient and inpatient care in {countryData.name}. Powered by machine learning.</p>
          </div>

          {/* Country Selector — prominent on landing */}
          <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:36}}>
            {Object.entries(COUNTRIES).map(([k, v]) => (
              <button key={k} onClick={() => setCountry(k)} style={{
                display:"flex",alignItems:"center",gap:8,padding:"12px 24px",borderRadius:12,
                border:country===k?"2px solid var(--pri)":"1.5px solid var(--surf3)",
                background:country===k?"var(--pri-bg)":"white",cursor:"pointer",
                transition:"all .2s",fontFamily:"var(--fb)",fontSize:15,fontWeight:country===k?600:400,
                color:country===k?"var(--pri)":"var(--txt2)",
              }}>
                <span style={{fontSize:22}}>{v.flag}</span> {v.name}
              </button>
            ))}
          </div>

          {/* Market Context */}
          <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:36,flexWrap:"wrap"}}>
            {[
              {label:"Healthcare spend", value: countryData.market.spend},
              {label:"Out-of-pocket", value: countryData.market.oop},
              {label:"UHC score", value: countryData.market.uhc + "/100"},
              ...(countryData.market.shi ? [{label:"SHI coverage", value: countryData.market.shi.split("(")[0].trim()}] : []),
            ].map((s,i)=>(
              <div key={i} style={{padding:"10px 18px",background:"var(--surf2)",borderRadius:10,textAlign:"center"}}>
                <div style={{fontSize:11,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:".5px",fontWeight:600}}>{s.label}</div>
                <div style={{fontSize:16,fontWeight:600,color:"var(--txt)",fontFamily:"var(--fd)",fontStyle:"italic",marginTop:2}}>{s.value}</div>
              </div>
            ))}
          </div>
          {countryData.market.note && <p style={{textAlign:"center",fontSize:13,color:"var(--txt3)",maxWidth:600,margin:"0 auto 32px",lineHeight:1.5}}>{countryData.market.note}</p>}

          {/* OPD + IPD Cards */}
          <div className="landing-cards">
            <div className="lcard opd" onClick={() => setPage("opd")}>
              <div className="lcard-badge"><I.Steth /> Outpatient — {countryData.name}</div>
              <h3>OPD Pricing</h3>
              <p>Per-visit pricing, annual plans, and care packages for outpatient services in {countryData.name}.</p>
              <div className="lcard-features">
                {countryData.products.filter(p=>p.cat==="OPD").map((p,i)=><div className="lcard-feat" key={i}>{p.name}: {p.desc}</div>)}
              </div>
              <button className="lcard-btn" onClick={(e)=>{e.stopPropagation();setPage("opd")}}>Get OPD Quote <I.Arrow /></button>
            </div>
            <div className="lcard ipd" onClick={() => setPage("ipd")}>
              <div className="lcard-badge"><I.Bed /> Inpatient — {countryData.name}</div>
              <h3>IPD Pricing</h3>
              <p>Admission estimates, surgery costs, annual inpatient plans, and surgical packages in {countryData.name}.</p>
              <div className="lcard-features">
                {countryData.products.filter(p=>p.cat==="IPD").map((p,i)=><div className="lcard-feat" key={i}>{p.name}: {p.desc}</div>)}
              </div>
              <button className="lcard-btn" onClick={(e)=>{e.stopPropagation();setPage("ipd")}}>Get IPD Quote <I.Arrow /></button>
            </div>
          </div>

          {/* Optional Add-ons */}
          {countryData.products.filter(p=>p.cat==="Optional").length > 0 && (
            <div style={{marginTop:28}}>
              <h3 style={{fontFamily:"var(--fd)",fontSize:20,fontWeight:400,fontStyle:"italic",textAlign:"center",marginBottom:16}}>Optional add-ons for {countryData.name}</h3>
              <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
                {countryData.products.filter(p=>p.cat==="Optional").map((p,i) => (
                  <div key={i} style={{background:"white",border:"1px solid var(--surf3)",borderRadius:14,padding:"20px 24px",minWidth:200,flex:"0 1 240px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      {iconMap[p.icon]||<I.Steth/>}
                      <span style={{fontWeight:600,fontSize:14}}>{p.name}</span>
                    </div>
                    <p style={{fontSize:12,color:"var(--txt2)",marginBottom:8,lineHeight:1.4}}>{p.desc}</p>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      {p.features.map((f,j) => <span key={j} style={{fontSize:11,color:"var(--txt3)"}}>{f}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full Product Catalog (collapsible) */}
          <details style={{marginTop:36,background:"white",borderRadius:14,border:"1px solid var(--surf3)",padding:24}}>
            <summary style={{fontFamily:"var(--fd)",fontSize:18,fontWeight:400,fontStyle:"italic",cursor:"pointer",marginBottom:16}}>
              View all {countryData.products.length} products for {countryData.name}
            </summary>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
              {countryData.products.map((p,i) => (
                <div key={i} style={{padding:16,borderRadius:10,border:"1px solid var(--surf3)",background:"var(--surf2)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontWeight:600,fontSize:13}}>{p.name}</span>
                    <span style={{padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:600,
                      background:p.cat==="OPD"?"var(--pri-bg)":p.cat==="IPD"?"var(--ipd-bg)":"var(--surf2)",
                      color:p.cat==="OPD"?"var(--pri)":p.cat==="IPD"?"var(--ipd)":"var(--txt3)"
                    }}>{p.cat}</span>
                  </div>
                  <p style={{fontSize:12,color:"var(--txt2)",marginBottom:8}}>{p.desc}</p>
                  {p.features.map((f,j) => <div key={j} style={{fontSize:11,color:"var(--txt3)",paddingLeft:10,borderLeft:"2px solid var(--surf3)",marginBottom:3}}>{f}</div>)}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* ─── OPD PAGE ─── */}
      {page === "opd" && <OPDPage apiOk={apiOk} onBack={() => setPage("landing")} />}

      {/* ─── IPD PAGE ─── */}
      {page === "ipd" && <IPDPage apiOk={apiOk} onBack={() => setPage("landing")} />}

      {/* ─── ADMIN ─── */}
      {page === "admin" && <AdminDashboard apiOk={apiOk} />}

      {/* ─── FOOTER ─── */}
      <footer className="footer">
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Logo size={26} />
          <span style={{fontFamily:"var(--fd)",fontSize:14,fontStyle:"italic"}}>DAC HealthPrice</span>
        </div>
        <div className="footer-tags">
          <span className="footer-tag">{countryData.flag} {countryData.name}</span>
          <span className="footer-tag">OPD</span><span className="footer-tag">IPD</span>
          <span className="footer-tag">FastAPI</span><span className="footer-tag">sklearn</span>
          <span className="footer-tag">Supabase</span>
        </div>
        <p>Demo — Synthetic Data</p>
      </footer>
    </div></>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPD PAGE (unchanged logic, extracted to component)
// ═══════════════════════════════════════════════════════════════════════════════
function OPDPage({ apiOk, onBack }) {
  const [mode, setMode] = useState("visit");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [isLocal, setIsLocal] = useState(false);
  const [visit, setVisit] = useState({service_type:"general_consultation",age:35,gender:"Male",region:"Phnom Penh",facility_type:"Private Hospital",specialty:"Internal Medicine",lab_tests:["Complete Blood Count"],procedure:"Wound Care",has_insurance:false,chronic_conditions:0});
  const [annual, setAnnual] = useState({age:35,gender:"Male",region:"Phnom Penh",plan_tier:"Plus",chronic_conditions:0,family_size:1});
  const [pkg, setPkg] = useState({package_type:"health_screening",age:35,gender:"Male",region:"Phnom Penh",add_ons:[]});

  const calculate = useCallback(async () => {
    setLoading(true); setResult(null); setIsLocal(false);
    try {
      let data;
      if (mode==="visit") data = await apiCall("/api/v1/price/visit", visit);
      else if (mode==="annual") data = await apiCall("/api/v1/price/annual-plan", annual);
      else data = await apiCall("/api/v1/price/package", pkg);
      setResult({mode,...data});
    } catch {
      try {
        let local;
        if (mode==="visit") local = localOpdVisit(visit);
        else if (mode==="annual") local = localOpdAnnual(annual);
        else local = localOpdPackage(pkg);
        setResult({mode,...local}); setIsLocal(true);
      } catch {}
    } finally { setLoading(false); }
  }, [mode, visit, annual, pkg]);

  const uv=(k,v)=>setVisit(p=>({...p,[k]:v}));
  const ua=(k,v)=>setAnnual(p=>({...p,[k]:v}));
  const up=(k,v)=>setPkg(p=>({...p,[k]:v}));
  const toggleLab=(t)=>setVisit(p=>{const c=p.lab_tests||[];return{...p,lab_tests:c.includes(t)?c.filter(x=>x!==t):[...c,t]};});

  return <>
    <section className="hero">
      <button className="back-btn" onClick={onBack}>← Back to Home</button>
      <div className="hero-badge opd"><I.Steth /> Outpatient Pricing</div>
      <h1>Outpatient Care,<br/><span className="opd-hi">Priced Intelligently</span></h1>
      <p>Get instant cost estimates for consultations, lab tests, procedures, annual plans, and care packages.</p>
    </section>
    <div className="tabs">
      <button className={`tab ${mode==="visit"?"active":""}`} onClick={()=>{setMode("visit");setResult(null)}}><I.Steth/> Per Visit</button>
      <button className={`tab ${mode==="annual"?"active":""}`} onClick={()=>{setMode("annual");setResult(null)}}><I.Calendar/> Annual Plan</button>
      <button className={`tab ${mode==="package"?"active":""}`} onClick={()=>{setMode("package");setResult(null)}}><I.Package/> Packages</button>
    </div>
    <div className="main">
      <div className="card form-card">
        <h3>{mode==="visit"?"Visit details":mode==="annual"?"Plan details":"Package selection"}</h3>
        {mode==="visit"&&<>
          <div className="fg"><label className="fl">Service type</label><div className="chips">{[["general_consultation","Consultation"],["specialist_visit","Specialist"],["lab_test","Lab Tests"],["minor_procedure","Procedure"]].map(([k,l])=><div key={k} className={`chip ${visit.service_type===k?"sel":""}`} onClick={()=>uv("service_type",k)}>{l}</div>)}</div></div>
          {visit.service_type==="specialist_visit"&&<div className="fg"><label className="fl">Specialty</label><div className="sw"><select className="fs" value={visit.specialty} onChange={e=>uv("specialty",e.target.value)}>{Object.keys(SPEC).map(s=><option key={s}>{s}</option>)}</select><I.Chev/></div></div>}
          {visit.service_type==="lab_test"&&<div className="fg"><label className="fl">Select tests</label><div className="chips">{Object.keys(LABS).map(t=><div key={t} className={`chip ${(visit.lab_tests||[]).includes(t)?"sel":""}`} onClick={()=>toggleLab(t)}>{t} (${LABS[t]})</div>)}</div></div>}
          {visit.service_type==="minor_procedure"&&<div className="fg"><label className="fl">Procedure</label><div className="sw"><select className="fs" value={visit.procedure} onChange={e=>uv("procedure",e.target.value)}>{Object.keys(PROCS).map(p=><option key={p}>{p}</option>)}</select><I.Chev/></div></div>}
          <div className="fr"><div className="fg"><label className="fl">Age</label><input className="fi" type="number" min="0" max="100" value={visit.age} onChange={e=>uv("age",Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}/></div><div className="fg"><label className="fl">Gender</label><div className="sw"><select className="fs" value={visit.gender} onChange={e=>uv("gender",e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select><I.Chev/></div></div></div>
          <div className="fr"><div className="fg"><label className="fl">Region</label><div className="sw"><select className="fs" value={visit.region} onChange={e=>uv("region",e.target.value)}>{Object.keys(RGN).map(r=><option key={r}>{r}</option>)}</select><I.Chev/></div></div><div className="fg"><label className="fl">Facility</label><div className="sw"><select className="fs" value={visit.facility_type} onChange={e=>uv("facility_type",e.target.value)}>{Object.keys(FAC).map(f=><option key={f}>{f}</option>)}</select><I.Chev/></div></div></div>
          <div className="fr"><div className="fg"><label className="fl">Chronic conditions</label><input className="fi" type="number" min="0" max="10" value={visit.chronic_conditions} onChange={e=>uv("chronic_conditions",Math.max(0,Math.min(10,parseInt(e.target.value)||0)))}/></div><div className="fg"><label className="fl">Insurance</label><div className="toggle-row"><button className={`toggle ${visit.has_insurance?"on":"off"}`} onClick={()=>uv("has_insurance",!visit.has_insurance)}/><span style={{fontSize:13,color:"var(--txt2)"}}>{visit.has_insurance?"Insured (-30%)":"No insurance"}</span></div></div></div>
        </>}
        {mode==="annual"&&<>
          <div className="fg"><label className="fl">Plan tier</label><div className="chips">{["Essential","Plus","Premium"].map(t=><div key={t} className={`chip ${annual.plan_tier===t?"sel":""}`} onClick={()=>ua("plan_tier",t)}>{t} — ${OPD_PLANS[t].base}/yr</div>)}</div></div>
          <div className="fr"><div className="fg"><label className="fl">Age</label><input className="fi" type="number" min="0" max="100" value={annual.age} onChange={e=>ua("age",Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}/></div><div className="fg"><label className="fl">Gender</label><div className="sw"><select className="fs" value={annual.gender} onChange={e=>ua("gender",e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select><I.Chev/></div></div></div>
          <div className="fr"><div className="fg"><label className="fl">Region</label><div className="sw"><select className="fs" value={annual.region} onChange={e=>ua("region",e.target.value)}>{Object.keys(RGN).map(r=><option key={r}>{r}</option>)}</select><I.Chev/></div></div><div className="fg"><label className="fl">Family size</label><input className="fi" type="number" min="1" max="10" value={annual.family_size} onChange={e=>ua("family_size",Math.max(1,Math.min(10,parseInt(e.target.value)||1)))}/></div></div>
          <div className="fg"><label className="fl">Chronic conditions</label><input className="fi" type="number" min="0" max="10" value={annual.chronic_conditions} onChange={e=>ua("chronic_conditions",Math.max(0,Math.min(10,parseInt(e.target.value)||0)))}/></div>
        </>}
        {mode==="package"&&<>
          <div className="fg"><label className="fl">Package</label><div className="chips">{Object.entries(PKGS).map(([k,v])=><div key={k} className={`chip ${pkg.package_type===k?"sel":""}`} onClick={()=>up("package_type",k)}>{v.name} — ${v.base}</div>)}</div></div>
          <div className="fr"><div className="fg"><label className="fl">Age</label><input className="fi" type="number" min="0" max="100" value={pkg.age} onChange={e=>up("age",Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}/></div><div className="fg"><label className="fl">Gender</label><div className="sw"><select className="fs" value={pkg.gender} onChange={e=>up("gender",e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select><I.Chev/></div></div></div>
          <div className="fg"><label className="fl">Region</label><div className="sw"><select className="fs" value={pkg.region} onChange={e=>up("region",e.target.value)}>{Object.keys(RGN).map(r=><option key={r}>{r}</option>)}</select><I.Chev/></div></div>
        </>}
        <button className="btn opd-btn" onClick={calculate} disabled={loading}>{loading?<><I.Spin/> Calculating...</>:<>Get Price <I.Arrow/></>}</button>
      </div>
      <div className="card result-card">
        <h3>Your estimate</h3>
        {result?<>
          <div className="price-box opd-box">
            <div className="price-label">{result.mode==="visit"?"Visit cost":result.mode==="annual"?"Annual premium":"Package cost"}</div>
            <div className="price-amount">${result.mode==="visit"?result.final_cost:result.mode==="annual"?result.annual_premium:result.total_cost}</div>
            {result.mode==="annual"&&<div className="price-sub">${result.monthly_premium}/month</div>}
            <div className="price-tag">{isLocal?"Local calc":`Model ${result.model_version}`}</div>
          </div>
          <div className="bk">
            <div className="bk-row"><span className="bk-l">Base cost</span><span className="bk-v">${result.base_cost||result.breakdown?.plan_base||"—"}</span></div>
            <div className="bk-row"><span className="bk-l">Cost multiplier</span><span className="bk-v hi">{result.cost_multiplier}x</span></div>
            {result.breakdown&&Object.entries(result.breakdown).filter(([k])=>k.includes("factor")).map(([k,v])=><div className="bk-row" key={k}><span className="bk-l">{k.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</span><span className="bk-v">{v}x</span></div>)}
            {result.insurance_discount>0&&<div className="bk-row"><span className="bk-l">Insurance discount</span><span className="bk-v hi">-${result.insurance_discount}</span></div>}
          </div>
          <div className="qid"><span>Quote ID</span><code>{result.quote_id}</code></div>
          {isLocal&&<div className="warn-box">Calculated locally — API unavailable</div>}
        </>:<div className="empty"><I.Steth/><p>Select a service and click<br/><strong>Get Price</strong></p></div>}
      </div>
    </div>
  </>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IPD PAGE (new)
// ═══════════════════════════════════════════════════════════════════════════════
function IPDPage({ apiOk, onBack }) {
  const [mode, setMode] = useState("admission");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [isLocal, setIsLocal] = useState(false);

  const [adm, setAdm] = useState({age:45,gender:"Male",region:"Phnom Penh",ward_type:"Private Room",surgery_type:"Appendectomy",los_days:3,comorbidities:0,has_insurance:false});
  const [plan, setPlan] = useState({age:45,gender:"Male",region:"Phnom Penh",plan_tier:"Enhanced",comorbidities:0,family_size:1});
  const [pkg, setPkg] = useState({package_type:"general_surgery",age:45,gender:"Male",region:"Phnom Penh"});

  const calculate = useCallback(async () => {
    setLoading(true); setResult(null); setIsLocal(false);
    try {
      let data;
      if (mode==="admission") data = await apiCall("/api/v1/price/ipd/admission", adm);
      else if (mode==="annual") data = await apiCall("/api/v1/price/ipd/annual-plan", plan);
      else data = await apiCall("/api/v1/price/ipd/package", pkg);
      setResult({mode,...data});
    } catch {
      try {
        let local;
        if (mode==="admission") local = localIpdAdmission(adm);
        else if (mode==="annual") local = localIpdAnnual(plan);
        else local = localIpdPackage(pkg);
        setResult({mode,...local}); setIsLocal(true);
      } catch {}
    } finally { setLoading(false); }
  }, [mode, adm, plan, pkg]);

  const ua=(k,v)=>setAdm(p=>({...p,[k]:v}));
  const up=(k,v)=>setPlan(p=>({...p,[k]:v}));
  const upk=(k,v)=>setPkg(p=>({...p,[k]:v}));

  return <>
    <section className="hero">
      <button className="back-btn" onClick={onBack}>← Back to Home</button>
      <div className="hero-badge ipd"><I.Bed /> Inpatient Pricing</div>
      <h1>Inpatient Care,<br/><span className="ipd-hi">Priced with Precision</span></h1>
      <p>Get instant cost estimates for hospital admissions, surgeries, annual inpatient plans, and surgical care packages.</p>
    </section>
    <div className="tabs">
      <button className={`tab ${mode==="admission"?"ipd-active":""}`} onClick={()=>{setMode("admission");setResult(null)}}><I.Bed/> Admission</button>
      <button className={`tab ${mode==="annual"?"ipd-active":""}`} onClick={()=>{setMode("annual");setResult(null)}}><I.Calendar/> Annual Plan</button>
      <button className={`tab ${mode==="package"?"ipd-active":""}`} onClick={()=>{setMode("package");setResult(null)}}><I.Package/> Packages</button>
    </div>
    <div className="main">
      <div className="card form-card">
        <h3>{mode==="admission"?"Admission details":mode==="annual"?"Plan details":"Package selection"}</h3>

        {mode==="admission"&&<>
          <div className="fg"><label className="fl">Ward type</label><div className="chips">{Object.keys(IPD_WARD).map(w=><div key={w} className={`chip ${adm.ward_type===w?"ipd-sel":""}`} onClick={()=>ua("ward_type",w)}>{w}{w!=="General Ward"?` (${IPD_WARD[w]}x)`:""}</div>)}</div></div>
          <div className="fg"><label className="fl">Surgery</label><div className="sw"><select className="fs" value={adm.surgery_type} onChange={e=>ua("surgery_type",e.target.value)}><option value="">No surgery (medical admission)</option>{Object.keys(IPD_SURGERY).map(s=><option key={s} value={s}>{s} (${IPD_SURGERY[s].toLocaleString()})</option>)}</select><I.Chev/></div></div>
          <div className="fr"><div className="fg"><label className="fl">Length of stay (days)</label><input className="fi" type="number" min="1" max="60" value={adm.los_days} onChange={e=>ua("los_days",Math.max(1,Math.min(60,parseInt(e.target.value)||1)))}/></div><div className="fg"><label className="fl">Age</label><input className="fi" type="number" min="0" max="100" value={adm.age} onChange={e=>ua("age",Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}/></div></div>
          <div className="fr"><div className="fg"><label className="fl">Gender</label><div className="sw"><select className="fs" value={adm.gender} onChange={e=>ua("gender",e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select><I.Chev/></div></div><div className="fg"><label className="fl">Region</label><div className="sw"><select className="fs" value={adm.region} onChange={e=>ua("region",e.target.value)}>{Object.keys(RGN).map(r=><option key={r}>{r}</option>)}</select><I.Chev/></div></div></div>
          <div className="fr"><div className="fg"><label className="fl">Comorbidities</label><input className="fi" type="number" min="0" max="10" value={adm.comorbidities} onChange={e=>ua("comorbidities",Math.max(0,Math.min(10,parseInt(e.target.value)||0)))}/></div><div className="fg"><label className="fl">Insurance</label><div className="toggle-row"><button className={`toggle ${adm.has_insurance?"on":"off"}`} onClick={()=>ua("has_insurance",!adm.has_insurance)}/><span style={{fontSize:13,color:"var(--txt2)"}}>{adm.has_insurance?"Insured (-25%)":"No insurance"}</span></div></div></div>
        </>}

        {mode==="annual"&&<>
          <div className="fg"><label className="fl">Plan tier</label><div className="chips">{Object.entries(IPD_PLANS).map(([k,v])=><div key={k} className={`chip ${plan.plan_tier===k?"ipd-sel":""}`} onClick={()=>up("plan_tier",k)}>{k} — ${v.base}/yr</div>)}</div></div>
          <div className="fr"><div className="fg"><label className="fl">Age</label><input className="fi" type="number" min="0" max="100" value={plan.age} onChange={e=>up("age",Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}/></div><div className="fg"><label className="fl">Gender</label><div className="sw"><select className="fs" value={plan.gender} onChange={e=>up("gender",e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select><I.Chev/></div></div></div>
          <div className="fr"><div className="fg"><label className="fl">Region</label><div className="sw"><select className="fs" value={plan.region} onChange={e=>up("region",e.target.value)}>{Object.keys(RGN).map(r=><option key={r}>{r}</option>)}</select><I.Chev/></div></div><div className="fg"><label className="fl">Family size</label><input className="fi" type="number" min="1" max="10" value={plan.family_size} onChange={e=>up("family_size",Math.max(1,Math.min(10,parseInt(e.target.value)||1)))}/></div></div>
          <div className="fg"><label className="fl">Comorbidities</label><input className="fi" type="number" min="0" max="10" value={plan.comorbidities} onChange={e=>up("comorbidities",Math.max(0,Math.min(10,parseInt(e.target.value)||0)))}/></div>
        </>}

        {mode==="package"&&<>
          <div className="fg"><label className="fl">Surgical package</label><div className="chips">{Object.entries(IPD_PACKAGES).map(([k,v])=><div key={k} className={`chip ${pkg.package_type===k?"ipd-sel":""}`} onClick={()=>upk("package_type",k)}>{v.name} — ${v.base.toLocaleString()}</div>)}</div></div>
          <div className="fr"><div className="fg"><label className="fl">Age</label><input className="fi" type="number" min="0" max="100" value={pkg.age} onChange={e=>upk("age",Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}/></div><div className="fg"><label className="fl">Gender</label><div className="sw"><select className="fs" value={pkg.gender} onChange={e=>upk("gender",e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select><I.Chev/></div></div></div>
          <div className="fg"><label className="fl">Region</label><div className="sw"><select className="fs" value={pkg.region} onChange={e=>upk("region",e.target.value)}>{Object.keys(RGN).map(r=><option key={r}>{r}</option>)}</select><I.Chev/></div></div>
        </>}

        <button className="btn ipd-btn" onClick={calculate} disabled={loading}>{loading?<><I.Spin/> Calculating...</>:<>Get Price <I.Arrow/></>}</button>
      </div>

      <div className="card result-card">
        <h3>Your estimate</h3>
        {result?<>
          <div className="price-box ipd-box">
            <div className="price-label">{result.mode==="admission"?"Admission cost":result.mode==="annual"?"Annual premium":"Package cost"}</div>
            <div className="price-amount">${result.mode==="admission"?result.final_cost?.toLocaleString():result.mode==="annual"?result.annual_premium?.toLocaleString():result.total_cost?.toLocaleString()}</div>
            {result.mode==="annual"&&<div className="price-sub">${result.monthly_premium}/month</div>}
            <div className="price-tag">{isLocal?"Local calc":`Model ${result.model_version}`}</div>
          </div>
          <div className="bk">
            {result.mode==="admission"&&result.breakdown&&<>
              <div className="bk-row"><span className="bk-l">Daily rate ({adm.ward_type})</span><span className="bk-v">${result.breakdown.daily_rate}/day</span></div>
              <div className="bk-row"><span className="bk-l">Length of stay</span><span className="bk-v">{result.breakdown.los_days} days</span></div>
              {result.breakdown.surgery_cost>0&&<div className="bk-row"><span className="bk-l">Surgery ({adm.surgery_type})</span><span className="bk-v">${result.breakdown.surgery_cost.toLocaleString()}</span></div>}
            </>}
            <div className="bk-row"><span className="bk-l">Base cost</span><span className="bk-v">${result.base_cost?.toLocaleString()||result.breakdown?.plan_base?.toLocaleString()||"—"}</span></div>
            <div className="bk-row"><span className="bk-l">Cost multiplier</span><span className="bk-v ipd-hi">{result.cost_multiplier}x</span></div>
            {result.breakdown&&Object.entries(result.breakdown).filter(([k])=>k.includes("factor")).map(([k,v])=><div className="bk-row" key={k}><span className="bk-l">{k.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</span><span className="bk-v">{v}x</span></div>)}
            {result.insurance_discount>0&&<div className="bk-row"><span className="bk-l">Insurance discount</span><span className="bk-v ipd-hi">-${result.insurance_discount.toLocaleString()}</span></div>}
            {result.mode==="annual"&&result.plan_benefits&&<>
              <div className="bk-row"><span className="bk-l">Room type</span><span className="bk-v">{result.plan_benefits.room}</span></div>
              <div className="bk-row"><span className="bk-l">Surgery limit</span><span className="bk-v">${result.plan_benefits.surgery_limit?.toLocaleString()}</span></div>
              <div className="bk-row"><span className="bk-l">ICU days</span><span className="bk-v">{result.plan_benefits.icu_days}</span></div>
              <div className="bk-row"><span className="bk-l">Annual limit</span><span className="bk-v">${result.plan_benefits.annual_limit?.toLocaleString()}</span></div>
            </>}
          </div>
          {result.package_includes&&<div className="includes-list" style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--surf3)"}}>
            <span style={{fontSize:11,fontWeight:600,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:".5px"}}>Package includes</span>
            {result.package_includes.map((item,i)=><div className="inc-item" key={i}><div className="inc-dot"/>{item}</div>)}
          </div>}
          <div className="qid"><span>Quote ID</span><code>{result.quote_id}</code></div>
          {isLocal&&<div className="warn-box">Calculated locally — API unavailable</div>}
        </>:<div className="empty"><I.Bed/><p>Configure your admission and click<br/><strong>Get Price</strong></p></div>}
      </div>
    </div>
  </>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD (unchanged from previous version)
// ═══════════════════════════════════════════════════════════════════════════════
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
      const [uh, mh] = await Promise.all([apiCall("/api/v1/admin/upload-history"), apiCall("/api/v1/admin/model-history")]);
      setUploadHistory(uh); setModelHistory(mh);
    } catch {}
  };
  useEffect(() => { if (apiOk) loadHistory(); }, [apiOk]);

  const handleUpload = async (file) => {
    if (!file || !file.name.endsWith(".csv")) { alert("Please select a CSV file"); return; }
    setUploading(true); setUploadResult(null);
    try {
      const form = new FormData(); form.append("file", file); form.append("description", description); form.append("auto_retrain", autoRetrain.toString());
      const r = await fetch(`${API}/api/v1/admin/upload-dataset`, { method: "POST", body: form, signal: AbortSignal.timeout(120000) });
      const data = await r.json(); setUploadResult(data);
      if (data.status === "accepted") loadHistory();
    } catch (e) { setUploadResult({ status: "error", detail: e.message }); }
    finally { setUploading(false); }
  };
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); };

  return <div style={{maxWidth:1060,margin:"0 auto",padding:"24px 28px 48px",animation:"fadeUp .4s ease both"}}>
    <h2 style={{fontFamily:"var(--fd)",fontSize:26,fontWeight:400,fontStyle:"italic",marginBottom:6}}>Admin dashboard</h2>
    <p style={{fontSize:14,color:"var(--txt2)",marginBottom:24}}>Upload datasets, manage models, and control the retraining pipeline</p>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
      {/* Upload */}
      <div style={{gridColumn:"1/-1",background:"white",borderRadius:"var(--r)",border:"1px solid var(--surf3)",padding:24}}>
        <h4 style={{fontFamily:"var(--fd)",fontSize:17,fontWeight:400,fontStyle:"italic",marginBottom:14}}>Upload training data</h4>
        <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}
          style={{border:`2px dashed ${dragOver?"var(--pri)":"var(--surf3)"}`,borderRadius:"var(--r)",padding:"32px 24px",textAlign:"center",background:dragOver?"var(--pri-bg)":"var(--surf2)",transition:"all .2s",cursor:"pointer"}}
          onClick={()=>document.getElementById("file-input").click()}>
          <input id="file-input" type="file" accept=".csv" onChange={e=>{const f=e.target.files[0];if(f)handleUpload(f)}} style={{display:"none"}}/>
          <p style={{fontSize:14,color:"var(--txt2)",fontWeight:500}}>{uploading?"Uploading...":"Drag & drop CSV or click to browse"}</p>
        </div>
        <div className="fr" style={{marginTop:12}}>
          <div className="fg" style={{marginBottom:0}}><label className="fl">Description</label><input className="fi" placeholder="e.g. Q1 2026 data" value={description} onChange={e=>setDescription(e.target.value)}/></div>
          <div className="fg" style={{marginBottom:0}}><label className="fl">Auto-retrain</label><div className="toggle-row" style={{marginTop:4}}><button className={`toggle ${autoRetrain?"on":"off"}`} onClick={()=>setAutoRetrain(!autoRetrain)}/><span style={{fontSize:13,color:"var(--txt2)"}}>{autoRetrain?"Yes":"No"}</span></div></div>
        </div>
        {uploadResult&&<div style={{marginTop:16,padding:14,borderRadius:"var(--rs)",background:uploadResult.status==="accepted"?"var(--pri-bg)":"#fef2f2",border:`1px solid ${uploadResult.status==="accepted"?"rgba(13,148,136,.2)":"#fecaca"}`}}>
          <div style={{fontWeight:600,fontSize:14,color:uploadResult.status==="accepted"?"var(--pri)":"#dc2626"}}>{uploadResult.status==="accepted"?"Dataset accepted":uploadResult.status==="rejected"?"Rejected":"Error"}</div>
          {uploadResult.rows_parsed&&<p style={{fontSize:13,color:"var(--txt2)",marginTop:4}}>{uploadResult.rows_parsed} rows parsed, {uploadResult.rows_inserted_to_db} inserted</p>}
          {uploadResult.retrain_result&&<p style={{fontSize:13,color:"var(--pri)",marginTop:4}}>Retrained: {uploadResult.retrain_result.new_version} (R²={uploadResult.retrain_result.r2})</p>}
        </div>}
      </div>
      {/* Model + DB status */}
      <div style={{background:"white",borderRadius:"var(--r)",border:"1px solid var(--surf3)",padding:24}}>
        <h4 style={{fontFamily:"var(--fd)",fontSize:17,fontWeight:400,fontStyle:"italic",marginBottom:14}}>Model status</h4>
        <div className="bk-row"><span className="bk-l">Status</span><span className="bk-v hi">{apiOk?"Active":"Offline"}</span></div>
        <div className="bk-row"><span className="bk-l">Type</span><span className="bk-v">GradientBoosting</span></div>
      </div>
      <div style={{background:"white",borderRadius:"var(--r)",border:"1px solid var(--surf3)",padding:24}}>
        <h4 style={{fontFamily:"var(--fd)",fontSize:17,fontWeight:400,fontStyle:"italic",marginBottom:14}}>Database</h4>
        <div className="bk-row"><span className="bk-l">Connection</span><span className="bk-v hi">{apiOk?"Connected":"Disconnected"}</span></div>
        <div className="bk-row"><span className="bk-l">Provider</span><span className="bk-v">Supabase PostgreSQL</span></div>
      </div>
      {/* Airflow */}
      <div style={{gridColumn:"1/-1",background:"white",borderRadius:"var(--r)",border:"1px solid var(--surf3)",padding:24}}>
        <h4 style={{fontFamily:"var(--fd)",fontSize:17,fontWeight:400,fontStyle:"italic",marginBottom:14}}>Airflow pipeline</h4>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {["Extract","Validate","Train","Evaluate","Promote","Notify"].map((s,i)=><div key={i} style={{flex:"1 1 100px",padding:12,background:"var(--surf2)",borderRadius:10,border:"1px solid var(--surf3)"}}><div style={{fontSize:12,fontWeight:600,color:"var(--ipd)"}}>Step {i+1}</div><div style={{fontSize:13,fontWeight:500}}>{s}</div></div>)}
        </div>
        <div style={{marginTop:14,display:"flex",gap:8}}>
          <button className="back-btn" style={{marginBottom:0}} onClick={async()=>{try{const r=await apiCall("/api/v1/admin/trigger-retrain",{});alert(`Retrain ${r.status}`)}catch{alert("Airflow not reachable")}}}><I.Refresh/> Trigger Retrain</button>
        </div>
      </div>
    </div>
  </div>;
}