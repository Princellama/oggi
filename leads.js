// /medicare/leads — GHL pipelines kept in step with a Google Sheet, both ways.
//
// Every 15 minutes (and on "Sync now"):
//   1. Read the sheet. For each row, compare the editable columns (Phone, Email, Stage, Tags, New note)
//      with what Oggi last wrote there (kept in the hidden _sync tab). A difference is Eric's edit:
//      push it to GHL and write a line to the Change log tab. A typed New note becomes a dated GHL note.
//   2. Read the four pipelines from GHL again (open opportunities, with notes), work out Last contacted
//      from GHL notes, People, logged calls and Encounters, and rewrite every tab plus _sync.
// The first sync only writes; it never pushes, so the sheet Claude uploaded can't trigger changes.
// Rows Eric adds or deletes in the sheet do nothing in GHL. Medicare numbers and SSNs in GHL notes
// are replaced before they reach the sheet or the page.
//
// Needs (Railway → Variables): GHL_TOKEN (a private-integration token for the sub-account),
// GOOGLE_SERVICE_ACCOUNT_JSON (the key file, pasted whole), LEADS_SHEET_ID. Without them the page
// shows the setup steps instead.

const crypto = require("crypto");
const N = require("./notion");

const LOCATION = process.env.GHL_LOCATION_ID || "YbzUO6KScIyteQDzcUAk";
const GHL = "https://services.leadconnectorhq.com";
const SHEET_ID = process.env.LEADS_SHEET_ID || "1TYNMyw1bXr1Cr7yO-XyTh1mL57TuEWsYt_xx9dNBSYY";
const PIPES = [
  { id: "zMCR7CpAeQEe8tRRkt0U", tab: "Events" },
  { id: "vvxPd0QieN9YdwUkQM7E", tab: "Retail Market" },
  { id: "owEECHWnh1NrzDGn3H1j", tab: "Referrals" },
  { id: "HE7RJf61XVsMzhmxTQC6", tab: "T65" },
];
const COLS = ["Name", "Phone ✎", "Email ✎", "Stage ✎", "Tags ✎", "New note ✎", "Notes", "Date added", "Last contacted", "Contacted via",
  "Stage changed", "Source", "Value", "Opportunity", "GHL contact ID", "Opportunity ID", "Open in GHL"];
const KEY = { name: 0, phone: 1, email: 2, stage: 3, tags: 4, newNote: 5, notes: 6, added: 7, last: 8, via: 9, stageChanged: 10,
  source: 11, value: 12, opp: 13, contactId: 14, oppId: 15, link: 16 };
const DS = { people: "47d42794-febb-4efb-9173-14a22ce848cb", calls: "243be2d4-fdf7-48c5-899a-568749b3cb42", enc: "c5dbb42f-1a8b-417c-8e22-d409c29e5009" };

const configured = () => !!(process.env.GHL_TOKEN && process.env.GOOGLE_SERVICE_ACCOUNT_JSON && SHEET_ID);
const missing = () => ["GHL_TOKEN", "GOOGLE_SERVICE_ACCOUNT_JSON"].filter((k) => !process.env[k]);

// ---------- GHL ----------
async function ghl(method, path, body) {
  const res = await fetch(GHL + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.GHL_TOKEN}`, Version: "2021-07-28", Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(`GHL ${res.status}: ${j.message || j.error || "failed"}`); e.status = res.status; throw e; }
  return j;
}
async function ghlPipelines() {
  const j = await ghl("GET", `/opportunities/pipelines?locationId=${LOCATION}`);
  return new Map((j.pipelines || []).map((p) => [p.id, { name: p.name, stages: p.stages || [] }]));
}
async function ghlOpen(pipelineId) {
  const out = []; let after = null, afterId = null;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ locationId: LOCATION, pipelineId, status: "open", limit: "100", getNotes: "true" });
    if (after) { q.set("startAfter", String(after)); q.set("startAfterId", afterId); }
    const j = await ghl("GET", `/opportunities/search?${q}`);
    out.push(...(j.opportunities || []));
    const m = j.meta || {};
    if (!m.nextPage || !(j.opportunities || []).length) break;
    after = m.startAfter; afterId = m.startAfterId;
  }
  return out;
}

// ---------- Google Sheets (service account, no extra packages) ----------
let gTok = null;
async function gToken() {
  if (gTok && gTok.exp > Date.now() + 60_000) return gTok.token;
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: key.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(key.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + sig }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error("Google sign-in failed: " + (j.error_description || j.error || res.status));
  gTok = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return gTok.token;
}
async function sheets(method, path, body) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    method, headers: { Authorization: `Bearer ${await gToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(`Sheets ${res.status}: ${(j.error && j.error.message) || "failed"}`); e.status = res.status; throw e; }
  return j;
}
const q = (tab) => `'${tab.replace(/'/g, "''")}'`;

// ---------- shaping ----------
const MBI = /\b\d[A-Za-z][A-Za-z0-9]\d-?[A-Za-z][A-Za-z0-9]\d-?[A-Za-z]{2}\d{2}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const scrub = (s) => String(s || "").replace(MBI, "[Medicare number on file]").replace(SSN, "[SSN removed]");
const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);
const phoneFmt = (p) => { const d = digits(p); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ""); };
const day = (s) => (s ? new Date(s).toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" }) : "");
const nameKey = (n) => {
  let s = String(n || "").toLowerCase();
  if (s.includes(",")) { const [l, f] = s.split(",", 2); s = f + " " + l; }
  const w = s.replace(/\(.*?\)/g, "").replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean);
  return w.length > 1 ? w[0] + " " + w[w.length - 1] : "";
};
const tagList = (s) => String(s || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

function notesOf(o) {
  const ns = ((o.notes && o.notes.notes) || []).filter((n) => !n.deleted).sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)));
  const text = []; let real = "";
  for (const n of ns) {
    const body = scrub(String(n.bodyText || n.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!body) continue;
    const d = day(n.dateAdded);
    text.push(d ? `[${d}] ${body}` : body);
    if (((n.createdBy || {}).source || "") !== "BULK_IMPORT" && d > real) real = d;
  }
  const joined = text.join(" | ");
  return { notes: joined.length > 1500 ? joined.slice(0, 1500) + "…" : joined, noteDate: real };
}

// Last contacted from Oggi's own records: People rows, logged calls, Encounters.
async function contactIndex() {
  const idx = new Map();
  const add = (keys, d, via) => { if (!d) return; for (const k of keys) if (k) { const cur = idx.get(k); if (!cur || d > cur.d) idx.set(k, { d, via }); } };
  const rd = N._read;
  const [people, calls, enc] = await Promise.all([
    N._queryAll(DS.people, { filter: { property: "Last contact", date: { is_not_empty: true } } }).catch(() => []),
    N._queryAll(DS.calls, { filter: { property: "Called at", date: { is_not_empty: true } } }).catch(() => []),
    N._queryAll(DS.enc, { filter: { property: "When", date: { is_not_empty: true } } }).catch(() => []),
  ]);
  for (const pg of people) {
    const p = pg.properties;
    add([(p.Email && p.Email.email || "").toLowerCase(), digits(p.Phone && p.Phone.phone_number), nameKey(rd(p.Name))], (rd(p["Last contact"]) || "").slice(0, 10), "People row");
  }
  for (const pg of calls) {
    const p = pg.properties;
    add([(rd(p.Email) || "").toLowerCase(), digits(rd(p.Phone)), rd(p["GHL contact ID"]), nameKey(rd(p.Name))], day(rd(p["Called at"])), "Call: " + (rd(p.Outcome) || "logged"));
  }
  for (const pg of enc) {
    const p = pg.properties;
    add(String(rd(p["GHL contact ID"]) || "").split(",").map((x) => x.trim()), day(rd(p.When)), "Encounter");
  }
  return idx;
}

function toLead(o, stages, idx, tab) {
  const c = o.contact || {};
  const name = c.name || o.name || "";
  const email = String(c.email || "").trim();
  const { notes, noteDate } = notesOf(o);
  const hits = [idx.get(email.toLowerCase()), idx.get(digits(c.phone)), idx.get(o.contactId), idx.get(nameKey(name)), noteDate ? { d: noteDate, via: "GHL note" } : null]
    .filter((x) => x && x.d);
  const last = hits.sort((a, b) => (b.d > a.d ? 1 : -1))[0] || null;
  const st = stages.find((s) => s.id === o.pipelineStageId);
  return {
    tab, oppId: o.id, contactId: o.contactId, pipelineId: o.pipelineId, name, phone: phoneFmt(c.phone), email,
    stage: st ? st.name : "", tags: (c.tags || []).join(", "), notes, added: day(o.createdAt),
    last: last ? last.d : "", via: last ? last.via : "", stageChanged: day(o.lastStageChangeAt), source: o.source || "",
    value: o.monetaryValue || 0, opp: o.name || "", link: `https://app.gohighlevel.com/v2/location/${LOCATION}/contacts/detail/${o.contactId}`,
  };
}
const leadRow = (l) => [l.name, l.phone, l.email, l.stage, l.tags, "", l.notes, l.added, l.last, l.via, l.stageChanged, l.source, l.value, l.opp, l.contactId, l.oppId, l.link];
const baseOf = (l) => ({ phone: digits(l.phone), email: l.email.toLowerCase(), stage: l.stage, tags: tagList(l.tags) });

// ---------- state ----------
const S = { leads: [], syncedAt: null, running: null, error: null, changes: [], first: true };

async function ensureTabs(meta) {
  const have = new Set(meta.sheets.map((s) => s.properties.title));
  const add = [];
  for (const t of ["Change log", "_sync"]) if (!have.has(t)) add.push({ addSheet: { properties: { title: t, hidden: t === "_sync" } } });
  for (const p of PIPES) if (!have.has(p.tab)) add.push({ addSheet: { properties: { title: p.tab } } });
  if (add.length) await sheets("POST", ":batchUpdate", { requests: add });
  if (!have.has("Change log")) await sheets("PUT", `/values/${encodeURIComponent("'Change log'!A1")}?valueInputOption=RAW`, { values: [["When (Hawaii)", "Pipeline", "Name", "What changed", "Result"]] });
  return have.has("_sync");
}

// Read Eric's edits from the sheet and push them to GHL.
async function pushEdits(pipes, logLines) {
  const ranges = PIPES.map((p) => `${q(p.tab)}!A1:Q2000`).concat(["'_sync'!A1:B5000"]);
  const got = await sheets("GET", `/values:batchGet?${ranges.map((r) => "ranges=" + encodeURIComponent(r)).join("&")}&valueRenderOption=FORMATTED_VALUE`);
  const base = new Map(((got.valueRanges[PIPES.length] || {}).values || []).map(([id, js]) => { try { return [id, JSON.parse(js)]; } catch { return [id, null]; } }));
  if (!base.size) return 0; // first sync: nothing to compare against yet
  let pushed = 0;
  const stamp = new Date().toLocaleString("en-US", { timeZone: "Pacific/Honolulu" });
  for (let i = 0; i < PIPES.length; i++) {
    const rows = (got.valueRanges[i] || {}).values || [];
    const head = (rows[0] || []).map((h) => String(h).replace(/\s*✎\s*$/, "").trim());
    const col = (name) => head.indexOf(name);
    const ci = { phone: col("Phone"), email: col("Email"), stage: col("Stage"), tags: col("Tags"), newNote: col("New note"), oppId: col("Opportunity ID"), contactId: col("GHL contact ID"), name: col("Name") };
    if (ci.oppId < 0) continue;
    const stages = (pipes.get(PIPES[i].id) || { stages: [] }).stages;
    for (const r of rows.slice(1)) {
      const oppId = r[ci.oppId], b = oppId && base.get(oppId);
      if (!b) continue;
      const cid = r[ci.contactId], who = r[ci.name] || "";
      const log = (what, result) => logLines.push([stamp, PIPES[i].tab, who, what, result]);
      const v = (k) => (ci[k] >= 0 ? String(r[ci[k]] ?? "").trim() : null);
      try {
        const contact = {};
        if (v("phone") !== null && digits(v("phone")) !== b.phone) contact.phone = v("phone");
        if (v("email") !== null && v("email").toLowerCase() !== b.email) contact.email = v("email");
        if (Object.keys(contact).length) { await ghl("PUT", `/contacts/${cid}`, contact); log("Contact: " + Object.entries(contact).map(([k, x]) => `${k} → ${x || "(blank)"}`).join(", "), "done"); pushed++; }
        if (v("stage") !== null && v("stage") !== b.stage) {
          const st = stages.find((s) => s.name.toLowerCase() === v("stage").toLowerCase());
          if (!st) log(`Stage “${v("stage")}”`, "not a stage in this pipeline; put back");
          else { await ghl("PUT", `/opportunities/${oppId}`, { pipelineStageId: st.id }); log(`Stage → ${st.name}`, "done"); pushed++; }
        }
        if (v("tags") !== null) {
          const now = tagList(v("tags")), was = b.tags || [];
          if (!sameSet(now, was)) {
            const add = now.filter((t) => !was.includes(t)), del = was.filter((t) => !now.includes(t));
            if (add.length) await ghl("POST", `/contacts/${cid}/tags`, { tags: add });
            if (del.length) await ghl("DELETE", `/contacts/${cid}/tags`, { tags: del });
            log(`Tags ${add.length ? "+" + add.join(", +") : ""}${add.length && del.length ? " " : ""}${del.length ? "−" + del.join(", −") : ""}`, "done"); pushed++;
          }
        }
        const note = v("newNote");
        if (note) { await ghl("POST", `/contacts/${cid}/notes`, { body: `${note}\n\n(from the pipeline sheet, ${stamp})` }); log("Note: " + note.slice(0, 120), "added"); pushed++; }
      } catch (e) { log("Push failed", e.message); }
    }
  }
  return pushed;
}

async function sync(reason = "timer") {
  if (!configured()) throw Object.assign(new Error("not configured"), { status: 409 });
  if (S.running) return S.running;
  S.running = (async () => {
    const logLines = [];
    try {
      const meta = await sheets("GET", "?fields=sheets.properties");
      const hadSync = await ensureTabs(meta);
      const pipes = await ghlPipelines();
      const pushed = hadSync ? await pushEdits(pipes, logLines) : 0;
      const [idx, ...opps] = await Promise.all([contactIndex(), ...PIPES.map((p) => ghlOpen(p.id))]);
      const leads = [];
      PIPES.forEach((p, i) => {
        const stages = (pipes.get(p.id) || { stages: [] }).stages;
        for (const o of opps[i]) leads.push(toLead(o, stages, idx, p.tab));
      });
      // Rewrite every tab, sorted by name, and the baseline the next pass compares against.
      const data = [];
      for (const p of PIPES) {
        const mine = leads.filter((l) => l.tab === p.tab).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
        data.push({ range: `${q(p.tab)}!A1`, values: [COLS, ...mine.map(leadRow)] });
      }
      data.push({ range: "'_sync'!A1", values: leads.map((l) => [l.oppId, JSON.stringify(baseOf(l))]) });
      await sheets("POST", "/values:batchClear", { ranges: PIPES.map((p) => `${q(p.tab)}!A1:Z5000`).concat(["'_sync'!A1:B5000"]) });
      await sheets("POST", "/values:batchUpdate", { valueInputOption: "RAW", data });
      if (logLines.length) await sheets("POST", `/values/${encodeURIComponent("'Change log'!A1")}:append?valueInputOption=RAW`, { values: logLines });
      S.leads = leads; S.syncedAt = new Date().toISOString(); S.error = null;
      S.changes = logLines.concat(S.changes).slice(0, 40);
      S.lastPushed = pushed; S.reason = reason;
    } catch (e) {
      S.error = e.message;
      console.error("leads sync:", e.message);
    } finally { S.running = null; }
  })();
  return S.running;
}

function status() {
  return {
    configured: configured(), missing: missing(), sheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
    syncedAt: S.syncedAt, running: !!S.running, error: S.error, lastPushed: S.lastPushed || 0,
    changes: S.changes.slice(0, 15).map(([when, tab, name, what, result]) => ({ when, tab, name, what, result })),
    pipelines: PIPES.map((p) => p.tab),
  };
}
async function get() {
  if (configured() && !S.syncedAt && !S.running) await sync("first load");
  return { ...status(), leads: S.leads };
}

// Add to Calls: a Medicare Calls row on today's list (Band Lead), deduped on Key.
async function addToCall(oppId, today) {
  const l = S.leads.find((x) => x.oppId === oppId);
  if (!l) throw Object.assign(new Error("not found"), { status: 404 });
  const key = `${today}__ghl-${l.contactId}`;
  const existing = await N._queryAll(DS.calls, { filter: { property: "Key", rich_text: { equals: key } } });
  if (existing.length) return { ok: true, already: true, name: l.name };
  const todays = await N._queryAll(DS.calls, { filter: { property: "Date", date: { equals: today } } });
  const order = todays.reduce((m, pg) => Math.max(m, (pg.properties.Order && pg.properties.Order.number) || 0), 0) + 1;
  const rich = N._rich;
  const props = {
    Name: { title: rich(l.name) }, Key: { rich_text: rich(key) }, Date: { date: { start: today } }, Band: { select: { name: "Lead" } },
    Order: { number: order }, Phone: { rich_text: rich(l.phone) }, Email: { rich_text: rich(l.email) }, "GHL contact ID": { rich_text: rich(l.contactId) },
    Tag: { rich_text: rich(l.tab) },
    Why: { rich_text: rich(`From the ${l.tab} pipeline, stage ${l.stage || "unknown"}${l.last ? `; last contacted ${l.last} (${l.via})` : "; no contact on record"}.`) },
    Context: { rich_text: rich([l.source && `Met: ${l.source}`, l.tags && `Tags: ${l.tags}`, l.notes && `Notes: ${l.notes.slice(0, 900)}`].filter(Boolean).join("\n")) },
  };
  await N._call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.calls }, properties: props });
  return { ok: true, name: l.name, order };
}

function start() {
  if (!configured()) { console.log("leads: not configured (" + missing().join(", ") + ")"); return; }
  setTimeout(() => sync("start"), 20_000);
  setInterval(() => sync("timer"), 15 * 60_000);
}

module.exports = { get, sync, status, addToCall, start, configured };
