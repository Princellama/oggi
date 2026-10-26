// In-memory stand-in for medicare.js (OGGI_DEMO=1). Same interface, sample rows.
const iso = (add) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + add); return d.toISOString().slice(0, 10); };
const at = (add, h) => `${iso(add)}T${String(h).padStart(2, "0")}:00:00.000-10:00`;
let n = 0;
const id = () => "demo-" + (++n);

const state = {
  pulse: [
    { headline: "HMSA closes two Akamai Advantage plans at year end", date: iso(-17), scope: "Hawaii", carriers: ["HMSA"], kind: "Exit / closure",
      summary: "HMSA is ending its Complete Plus and Standard Plus Medicare Advantage plans on Dec 31. About 16,000 members will be disenrolled and need to choose new coverage.",
      why: "The biggest pool of people who must make a choice this AEP. Many are long-time HMSA members who have never compared plans.",
      action: "Make an educational post on what disenrolled members can do, and ask provider offices how many of their patients are affected.",
      link: "https://www.staradvertiser.com/2026/10/04/hawaii-news/hmsa-revamping-medicare-advantage-plans/", source: "Star-Advertiser", status: "New", contentIdea: true },
    { headline: "Humana to exit plans covering about 600,000 members in 2027", date: iso(-60), scope: "National", carriers: ["Humana"], kind: "Exit / closure",
      summary: "Humana is pulling out of Medicare Advantage plans that cover roughly 600,000 members next year, mostly lower-star plans, as it chases margin.",
      why: "Supports the read that members are leaving Humana. Which Hawaii plans are affected is not confirmed yet.",
      action: "Check the Humana broker portal for Hawaii plan terminations and list affected clients in the book.",
      link: "https://www.beckershospitalreview.com/finance/humana-to-exit-medicare-advantage-plans-covering-600000-members-in-2027/", source: "Becker's", status: "Read", contentIdea: false },
    { headline: "CMS: Hawaii has 46 Medicare Advantage plans for 2027, up from 44", date: iso(-25), scope: "Hawaii", carriers: ["CMS"], kind: "Rates & costs",
      summary: "CMS's Hawaii fact sheet puts the average MA premium flat at about $53 a month, with two more plans on offer than this year.",
      why: "More choice and flat premiums: a calm headline that sits beside the HMSA closures.",
      action: "", link: "https://www.thegardenisland.com/?p=425699", source: "The Garden Island", status: "New", contentIdea: true },
  ].map((r) => ({ id: id(), url: null, carriers: [], ...r })),
  campaigns: [
    { name: "Devoted kiosk - Salt Lake #9955 (AEP 2027)", channel: "Kiosk", carriers: ["Devoted"], start: "2026-09-15", cost: 0, pieces: null, leads: 9, appointments: 3, enrollments: 1, countedOn: iso(-2), status: "Running", match: "kiosk-salt-lake, Salt Lake #9955", tracking: "GHL source on every kiosk contact" },
    { name: "Devoted kiosk - Kalihi #9653 (AEP 2027)", channel: "Kiosk", carriers: ["Devoted"], start: "2026-09-15", cost: 0, leads: 4, appointments: 1, enrollments: 0, countedOn: iso(-2), status: "Running", match: "kiosk-kalihi, Kalihi #9653", tracking: "GHL source on every kiosk contact" },
    { name: "Devoted community letter (fall 2026)", channel: "Mailer", carriers: ["Devoted"], start: "2026-10-01", cost: 640, pieces: 800, leads: 3, appointments: 1, enrollments: null, countedOn: iso(-2), status: "Running", match: "mailer, letter", tracking: "Ask how they heard; tag mailer-devoted in GHL" },
  ].map((r) => ({ id: id(), url: null, end: null, notes: "", ...r })),
  content: [
    { title: "At the Salt Lake table", kind: "In the field", photos: 1, thumbs: 1, brief: "Me at the Devoted table, Salt Lake, Wednesday morning.",
      ig: "Wednesday mornings you'll find me at the Salt Lake store, answering Medicare questions over a cup of coffee. No appointment, no pressure. Stop by and say hi.",
      fb: "Every Wednesday and Thursday this AEP I'm at the Salt Lake store from 8 to 11. If your plan is changing next year or you just want someone to explain your options, come by the table.",
      summary: "Eric's weekly kiosk hours at Salt Lake during AEP.", cta: "Stop by Wednesdays and Thursdays, 8–11, or call (808) 256-6736.",
      disclaimer: "We do not offer every plan available in your area. Currently we represent 3 organizations which offer 26 products in your area. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.",
      compliance: "Educational - no plan named", status: "Ready", postDate: null },
    { title: "If your HMSA plan is ending", kind: "Educational", photos: 0, thumbs: 0, brief: "Explain what members of the closing HMSA plans can do. No plan names.", status: "Requested" },
  ].map((r) => ({ id: id(), url: null, ig: "", fb: "", summary: "", cta: "", disclaimer: "", compliance: null, materialId: "", postDate: null, campaign: null, created: new Date().toISOString(), ...r })),
  partners: [
    { name: "Kalihi family clinic", channel: "Providers", type: "Organization", phase: "3 Working", contact: "Front desk manager", networks: ["HMSA", "UHC"], disruption: "HMSA plan closing", nextStep: "Drop off the AEP schedule card for the front desk", lastContact: iso(-12), leads: 2 },
    { name: "Care home network (Waipahu)", channel: "Providers", type: "Organization", phase: "2 Layout strategy", contact: "Owner", networks: ["Humana", "Devoted"], disruption: "Humana changes", nextStep: "Ask which residents are on Humana plans", lastContact: iso(-30), leads: 0 },
    { name: "Filipino Chamber of Commerce", channel: "Employers / Organizations", type: "Organization", phase: "4 Producing", contact: "", networks: [], disruption: null, nextStep: "", lastContact: iso(-45), leads: 6 },
  ].map((r) => ({ id: id(), url: null, phone: null, email: null, notes: "", ...r })),
  field: [
    { name: "Kiosk - Salt Lake #9955", start: at(0, 8), end: at(0, 11), kind: "Kiosk", site: "Salt Lake #9955", address: "848 Ala Lilikoi St", carrier: "Devoted" },
    { name: "Kiosk - Salt Lake #9955", start: at(1, 8), end: at(1, 11), kind: "Kiosk", site: "Salt Lake #9955", address: "848 Ala Lilikoi St", carrier: "Devoted" },
    { name: "Kiosk - Kalihi #9653", start: at(2, 8), end: at(2, 11), kind: "Kiosk", site: "Kalihi #9653", address: "1620 N School St", carrier: "Devoted" },
  ].map((r) => ({ id: id(), peopleMet: null, notes: "", campaign: null, ...r })),
};

state.portals = [
  { name: "UHC Jarvis", carrier: "UHC", what: "UHC's agent portal: certifications, Ready to Sell, JarvisEnroll, commissions.", kinds: ["Certification", "Quote & enroll", "Commissions"], website: "https://www.uhcjarvis.com", rts: "Action needed", lastChecked: iso(0), notes: "Not showing as appointed in Sunfire. Check Learning Lab." },
  { name: "Sircon (Vertafore)", carrier: "Industry", what: "Contracting and appointment paperwork.", kinds: ["Contracting & appointments"], website: "https://www.sircon.com", emailsTo: "eric@barayugacpa.com", rts: "n/a", lastChecked: iso(0), notes: "Hawaii license active to 31 Jan 2027." },
  { name: "Sunfire", carrier: "IFG", what: "Quote and enroll across carriers. Login through IFG.", kinds: ["Quote & enroll"], rts: "n/a", lastChecked: iso(0) },
  { name: "Humana Vantage / MarketPoint", carrier: "Humana", what: "Recertification, Ready to Sell, commissions.", kinds: ["Certification", "Training", "Commissions"], emailsTo: "48sigma@gmail.com", rts: "Pending", notes: "Recert done 29 Jul 2026." },
  { name: "Devoted agent portal", carrier: "Devoted", what: "Ready to Sell, member lookups, materials.", kinds: ["Certification", "Book of business"], website: "https://agent.devoted.com", login: "48sigma@gmail.com", hint: "Google Password Manager", rts: "Ready to sell" },
  { name: "AHIP", carrier: "Industry", what: "Annual AHIP Medicare + FWA training.", kinds: ["Certification", "Training"], website: "https://www.ahipmedicaretraining.com", rts: "n/a" },
].map((r) => ({ id: id(), url: null, kinds: [], website: null, login: "", hint: "", emailsTo: null, lastChecked: null, support: "", notes: "", ...r }));

const copy = (x) => JSON.parse(JSON.stringify(x));
async function getAll() {
  return {
    pulse: { rows: copy(state.pulse.filter((r) => r.status !== "Archived")) },
    campaigns: { rows: copy(state.campaigns) },
    content: { rows: copy(state.content) },
    partners: { rows: copy(state.partners) },
    field: { rows: copy(state.field) },
    portals: { rows: copy(state.portals) },
  };
}
const find = (t, i) => { const r = state[t].find((x) => x.id === i); if (!r) throw Object.assign(new Error("not found"), { status: 404 }); return r; };
async function setPulse(i, f) { return copy(Object.assign(find("pulse", i), f)); }
async function updateCampaign(i, f) { return copy(Object.assign(find("campaigns", i), f)); }
async function createCampaign(f) { const r = { id: id(), carriers: [], leads: null, appointments: null, enrollments: null, status: "Running", notes: "", tracking: "", match: "", ...f }; state.campaigns.unshift(r); return copy(r); }
async function updateContent(i, f) { return copy(Object.assign(find("content", i), f)); }
async function createContent({ title, kind, brief, campaign, image }) {
  const r = { id: id(), url: null, title, kind, brief, campaign: campaign || null, photos: image ? 1 : 0, thumbs: 0, ig: "", fb: "", summary: "", cta: "", disclaimer: "", compliance: null, materialId: "", status: "Requested", postDate: null, created: new Date().toISOString() };
  state.content.unshift(r); return copy(r);
}
async function updatePartner(i, f) { return copy(Object.assign(find("partners", i), f)); }
async function updatePortal(i, f) { return copy(Object.assign(find("portals", i), f)); }
async function fileUrl() { return null; }

module.exports = { getAll, setPulse, updateCampaign, createCampaign, updateContent, createContent, updatePartner, updatePortal, fileUrl };
