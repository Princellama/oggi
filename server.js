// Oggi — Eric's daily brief on the web.
// Notion is the store: Claude writes Brief Days / Brief Items, this app reads and edits them.

const express = require("express");
const crypto = require("crypto");
const path = require("path");

// Demo mode skips sign-in and serves sample data, so it only ever runs when asked for
// explicitly, and never on Railway.
const ON_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT_NAME || !!process.env.RAILWAY_PROJECT_ID;
const DEMO = process.env.OGGI_DEMO === "1" && !ON_RAILWAY;
if (!DEMO && !process.env.NOTION_TOKEN) {
  console.error("NOTION_TOKEN is not set. Refusing to start without it (use npm run dev for demo data).");
  process.exit(1);
}
const store = DEMO ? require("./demo") : require("./notion");
const mstore = DEMO ? require("./medicare-demo") : require("./medicare");
const cstore = DEMO ? require("./cpa-demo") : require("./cpa");
const fstore = DEMO ? require("./flown-demo") : require("./flown");
const istore = DEMO ? require("./italian-demo") : require("./italian");
const coach = require("./coach");
const feedstore = DEMO ? require("./feeding-demo") : require("./feeding");

const PORT = process.env.PORT || 8080;
const SECRET = process.env.SESSION_SECRET || (DEMO ? "demo-secret" : null);
const ALLOWED = (process.env.ALLOWED_EMAIL || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const MAIL_FROM = process.env.MAIL_FROM || "Oggi <oggi@princellama.com>";
// Username + PIN sign-in. Both live only in Railway → Variables, never in the code.
const PIN_USER = (process.env.OGGI_USER || "").trim().toLowerCase();
const PIN = (process.env.OGGI_PIN || "").trim();

if (!SECRET) {
  console.error("SESSION_SECRET is not set. Refusing to start without it.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1); // Railway sits in front; needed for per-device lockout
app.disable("x-powered-by");
// Photos for /medicare come up as base64 JSON, so that one route takes a larger body.
const smallJson = express.json({ limit: "64kb" });
const bigJson = express.json({ limit: "14mb" });
app.use((req, res, next) => (req.method === "POST" && req.path === "/api/medicare/content" ? bigJson : smallJson)(req, res, next));
app.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  next();
});

// ---------- signed tokens (stateless) ----------
const b64 = (s) => Buffer.from(s).toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url").toString();
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const want = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(unb64(body));
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}
function cookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function authed(req) {
  if (DEMO) return { e: "demo" };
  return verify(cookie(req, "oggi"));
}
function requireAuth(req, res, next) {
  if (authed(req)) return next();
  res.status(401).json({ error: "signin" });
}

// ---------- magic link ----------
const recent = new Map(); // email -> last send time
app.post("/auth/request", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  // Always answer the same way, so the page never confirms which address is allowed.
  const reply = () => res.json({ ok: true });
  if (!ALLOWED.includes(email)) return reply();
  const last = recent.get(email) || 0;
  if (Date.now() - last < 60_000) return reply();
  recent.set(email, Date.now());
  const token = sign({ e: email, k: "link", exp: Date.now() + 15 * 60_000 });
  const link = `${BASE_URL}/auth/verify?t=${encodeURIComponent(token)}`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [email],
        subject: "Your Oggi sign-in link",
        text: `Open this link to sign in to Oggi. It works once, for 15 minutes.\n\n${link}\n\nIf you did not ask for it, ignore this email.`,
      }),
    });
    if (!r.ok) console.error("Resend error", r.status, await r.text());
  } catch (e) {
    console.error("Resend failed", e.message);
  }
  reply();
});

// ---------- username + PIN ----------
// A four-digit PIN is only 10,000 guesses, so wrong tries lock out hard:
// 5 wrong from one connection → that connection waits 15 minutes;
// 15 wrong from anywhere within an hour → PIN sign-in pauses for an hour (the email link still works).
const pinFails = new Map(); // ip -> { n, until }
let pinGlobal = { n: 0, since: Date.now(), until: 0 };
const hashed = (s) => crypto.createHash("sha256").update(String(s)).digest();
function setSession(res, who) {
  const session = sign({ e: who, k: "session", exp: Date.now() + 90 * 24 * 3600_000 });
  const secure = BASE_URL.startsWith("https") ? "; Secure" : "";
  res.set("Set-Cookie", `oggi=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${90 * 24 * 3600}${secure}`);
}
app.get("/auth/methods", (req, res) => res.json({ pin: !!(PIN_USER && PIN), email: ALLOWED.length > 0 }));
app.post("/auth/pin", (req, res) => {
  if (!PIN_USER || !PIN) return res.status(503).json({ error: "PIN sign-in is not set up." });
  const now = Date.now();
  if (now - pinGlobal.since > 3600_000) pinGlobal = { n: 0, since: now, until: 0 };
  if (pinGlobal.until > now) return res.status(429).json({ error: "Too many wrong PINs. PIN sign-in is paused for an hour — use the email link instead." });
  const ip = req.ip || "?";
  const f = pinFails.get(ip) || { n: 0, until: 0 };
  if (f.until > now) return res.status(429).json({ error: `Too many wrong tries. Try again in ${Math.ceil((f.until - now) / 60000)} minutes.` });
  const user = String(req.body.user || "").trim().toLowerCase();
  const pin = String(req.body.pin || "").trim();
  const ok = crypto.timingSafeEqual(hashed(user), hashed(PIN_USER)) & crypto.timingSafeEqual(hashed(pin), hashed(PIN));
  if (!ok) {
    f.n += 1;
    if (f.n >= 5) { f.until = now + 15 * 60_000; f.n = 0; }
    pinFails.set(ip, f);
    pinGlobal.n += 1;
    if (pinGlobal.n >= 15) { pinGlobal.until = now + 3600_000; console.error("PIN sign-in paused after repeated wrong PINs"); }
    return res.status(401).json({ error: "That username and PIN don't match." });
  }
  pinFails.delete(ip);
  setSession(res, ALLOWED[0] || PIN_USER);
  res.json({ ok: true });
});

const usedLinks = new Set();
app.get("/auth/verify", (req, res) => {
  const t = String(req.query.t || "");
  const p = verify(t);
  if (!p || p.k !== "link" || usedLinks.has(t)) return res.redirect("/?signin=expired");
  usedLinks.add(t);
  setSession(res, p.e);
  res.redirect("/");
});
app.post("/auth/signout", (req, res) => {
  res.set("Set-Cookie", "oggi=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  res.json({ ok: true });
});
app.get("/auth/me", (req, res) => res.json({ signedIn: !!authed(req), demo: DEMO }));

// ---------- API ----------
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.message || "failed" });
});
const localDate = (req) => (/^\d{4}-\d{2}-\d{2}$/.test(req.query.d || req.body?.d || "") ? (req.query.d || req.body.d) : new Date().toISOString().slice(0, 10));
const stamp = () => new Date().toISOString().slice(11, 16) + "Z";

// The true time, so a phone whose clock is off (ship Wi-Fi, a hand-set clock) can correct itself.
app.get("/api/time", (req, res) => { res.set("Cache-Control", "no-store"); res.json({ t: Date.now() }); });

app.get("/api/brief", requireAuth, wrap(async (req, res) => {
  const date = localDate(req);
  const [b, flown] = await Promise.all([store.getBrief(date), fstore.getDay(date).catch((e) => { console.error("flown day", e.message); return []; })]);
  if (!b) return res.json({ day: null, items: [] });
  b.day.flown = flown;   // today's FLOWN sessions, for the sky's Timeline
  res.json(b);
}));

// Star History: every job seen in the last 7, 30 or 90 days, open or done.
app.get("/api/history", requireAuth, wrap(async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  res.json({ days, items: await store.getHistory(localDate(req), days) });
}));

// ---------- hand-offs ----------
// Handing an item to Milli or Virgilio queues it for Claude (the delegate skill). Claude sends from
// Eric's own Gmail: his notes turned into a short email with a checklist, and when the item came in
// by email, the original forwarded underneath with its attachments. Chosen by Eric on 27 Oct 2026
// over an instant email from Oggi, because only a forward carries the attachments.
// Oggi only sets Handoff step to Queued or Ask status; the skill writes Sent, Status asked, Replied, Done.
const EMAILED_TO = ["Milli", "Virgilio"];

app.patch("/api/item/:id", requireAuth, wrap(async (req, res) => {
  const allowed = ["handoffNotes", "handoffStep", "title", "note", "place", "area", "order", "decision", "status", "delegatedTo", "waitingOn", "invoice", "novaStart", "novaCooled"];
  const fields = {};
  for (const k of allowed) if (k in req.body) fields[k] = req.body[k];
  if (fields.place && !["Skyline", "Airport", "Kalihi", "Kakaako", "Kahala", "Hawaii Kai", "Home"].includes(fields.place)) return res.status(400).json({ error: "place" });
  if (fields.area && !["CPA", "Medicare", "Personal", "Money"].includes(fields.area)) return res.status(400).json({ error: "area" });
  if ("decision" in fields && fields.decision !== null && !["Tomorrow", "This week", "Let go"].includes(fields.decision)) return res.status(400).json({ error: "decision" });
  if ("status" in fields && !["Open", "Closed"].includes(fields.status)) return res.status(400).json({ error: "status" });
  if ("status" in fields) fields.closedOn = fields.status === "Closed" ? localDate(req) : null;
  if ("delegatedTo" in fields) {
    if (fields.delegatedTo !== null && !["Milli", "Virgilio", "Someone else"].includes(fields.delegatedTo)) return res.status(400).json({ error: "delegatedTo" });
    fields.delegatedOn = fields.delegatedTo ? localDate(req) : null;
    // a new hand-off to someone with email goes in the queue; taking it back empties the queue
    if (!("handoffStep" in fields)) fields.handoffStep = EMAILED_TO.includes(fields.delegatedTo) ? "Queued" : null;
  }
  if ("handoffStep" in fields && fields.handoffStep !== null && !["Queued", "Ask status"].includes(fields.handoffStep)) return res.status(400).json({ error: "handoffStep" });
  if ("handoffNotes" in fields) fields.handoffNotes = String(fields.handoffNotes || "").slice(0, 1900);
  if ("invoice" in fields) {
    if (fields.invoice !== null && !["To send", "Sent", "Paid"].includes(fields.invoice)) return res.status(400).json({ error: "invoice" });
    // paid closes the invoice; moving it back reopens it
    fields.status = fields.invoice === "Paid" ? "Closed" : "Open";
    fields.closedOn = fields.invoice === "Paid" ? localDate(req) : null;
  }
  if ("waitingOn" in fields) {
    if (fields.waitingOn !== null && (typeof fields.waitingOn !== "string" || !fields.waitingOn.trim() || fields.waitingOn.length > 60)) return res.status(400).json({ error: "waitingOn" });
    fields.waitingOn = fields.waitingOn ? fields.waitingOn.trim() : null;
    fields.waitingSince = fields.waitingOn ? localDate(req) : null;
  }
  for (const k of ["novaStart", "novaCooled"]) if (k in fields && fields[k] !== null && (typeof fields[k] !== "string" || isNaN(Date.parse(fields[k])))) return res.status(400).json({ error: k });
  const item = await store.updateItem(req.params.id, fields);

  // Change log line, written in Eric's own terms so it can ride into a Claude prompt.
  const dayId = req.body.dayId;
  const t = item.title;
  let line = null;
  if ("decision" in fields) {
    line = fields.decision ? `${t} → ${fields.decision}` : `${t} → choice cleared`;
    if (fields.decision && item.task) await store.applyDecisionToTask(item.task, fields.decision, localDate(req)).catch((e) => console.error("task move", e.message));
  } else if ("status" in fields) line = `${t} → marked ${fields.status === "Closed" ? "done" : "open again"}`;
  else if ("title" in fields) line = `Renamed an item to “${t}”`;
  else if ("place" in fields) line = `${t} → moved to ${fields.place}`;
  else if ("area" in fields) line = `${t} → area ${fields.area}`;
  else if ("delegatedTo" in fields) line = fields.delegatedTo ? `${t} → handed to ${fields.delegatedTo === "Someone else" ? "someone else" : fields.delegatedTo}` : `${t} → taken back (no longer delegated)`;
  else if ("invoice" in fields) line = `${t} → invoice ${String(fields.invoice || "cleared").toLowerCase()}`;
  else if ("waitingOn" in fields) line = fields.waitingOn ? `${t} → waiting on ${fields.waitingOn}` : `${t} → they answered (no longer waiting)`;
  else if ("note" in fields && fields.note) line = `Update for Claude on ${t}: ${fields.note}`;
  else if ("handoffStep" in fields && fields.handoffStep === "Ask status") line = `${t} → asked ${item.delegatedTo || "them"} for a status`;
  else if ("handoffNotes" in fields && fields.handoffNotes) line = `Hand-off notes on ${t}: ${fields.handoffNotes}`;
  else if ("novaCooled" in fields && fields.novaCooled) line = `${t} → supernova cooling off`;
  else if ("novaStart" in fields && fields.novaStart) line = `${t} → supernova lit (grows every hour until it's done)`;
  const mergeKey = "note" in fields ? `Update for Claude on ${t}:` : "handoffNotes" in fields ? `Hand-off notes on ${t}:` : ("decision" in fields ? `${t} → ` : null);
  if (line && dayId) await store.logEdit(dayId, `${stamp()} ${line}`, mergeKey);
  res.json(item);
}));

app.patch("/api/day/:id", requireAuth, wrap(async (req, res) => {
  const fields = {};
  if ("intentions" in req.body) fields.intentions = String(req.body.intentions).slice(0, 4000);
  if ("log" in req.body) fields.log = String(req.body.log).slice(0, 2000);
  const day = await store.updateDay(req.params.id, fields);
  if (fields.intentions) await store.logEdit(req.params.id, `${stamp()} Intentions: ${fields.intentions}`, "Intentions:");
  if (fields.log) await store.logEdit(req.params.id, `${stamp()} Log: ${fields.log}`, "Log:");
  res.json(day);
}));

app.post("/api/capture", requireAuth, wrap(async (req, res) => {
  const text = String(req.body.text || "").trim().slice(0, 300);
  if (!text) return res.status(400).json({ error: "empty" });
  const task = await store.createTask(text, localDate(req));
  if (req.body.dayId) await store.logEdit(req.body.dayId, `${stamp()} Captured: ${text}`);
  res.json(task);
}));

// ---------- outbox ----------
app.get("/api/events", requireAuth, wrap(async (req, res) => {
  // from yesterday, so an event running across midnight in Hawaii is never dropped
  const from = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    res.json({ events: await store.getEvents(from) });
  } catch (e) {
    if (e.status === 404 || /could not find|not shared|object_not_found/i.test(e.message || "")) {
      return res.status(409).json({ error: "share" });
    }
    throw e;
  }
}));

app.get("/api/outbox", requireAuth, wrap(async (req, res) => {
  try {
    res.json({ rows: await store.getOutbox() });
  } catch (e) {
    // The oggi integration has to be added to People and Partners in Notion before this works.
    if (e.status === 404 || /could not find|not shared|object_not_found/i.test(e.message || "")) {
      return res.status(409).json({ error: "share" });
    }
    throw e;
  }
}));

app.patch("/api/outbox/:id", requireAuth, wrap(async (req, res) => {
  const on = !!req.body.pushed;
  const row = await store.setPushed(req.params.id, on ? localDate(req) : null);
  const name = String(req.body.name || row.name || "").slice(0, 120);
  const to = Array.isArray(req.body.pushTo) ? req.body.pushTo.join(", ").slice(0, 60) : "";
  if (req.body.dayId && name) await store.logEdit(req.body.dayId, `${stamp()} Outbox: ${name} → ${on ? `pushed${to ? ` to ${to}` : ""}` : "back in the outbox"}`).catch(() => {});
  res.json(row);
}));

app.post("/api/edits/clear", requireAuth, wrap(async (req, res) => {
  if (!req.body.dayId) return res.status(400).json({ error: "dayId" });
  await store.updateDay(req.body.dayId, { edits: "" });
  res.json({ ok: true });
}));

// ---------- XTEINK screens (images live on JIRO; proxied so the token stays server-side) ----------
const XT_BASE = process.env.XTEINK_URL || "https://jiro.princellama.com/xt/" + (process.env.XTEINK_TOKEN || "zjxvj8Eulmkq");
app.get("/api/xteink/screens", requireAuth, wrap(async (req, res) => {
  const r = await fetch(XT_BASE + "/screens.json");
  if (!r.ok) return res.json([]);
  const list = await r.json();
  res.set("Cache-Control", "no-cache").json(list.map((s) => ({ kind: s.kind, label: s.label, day: s.day, pick: !!s.pick, why: s.why || "" })));
}));
app.get("/api/xteink/:kind.:ext", requireAuth, wrap(async (req, res) => {
  const { kind, ext } = req.params;
  if (!["dashboard", "prospecting", "cpa", "quote", "book"].includes(kind) || !["png", "bmp"].includes(ext)) return res.status(404).end();
  const r = await fetch(`${XT_BASE}/${kind === "dashboard" ? "today" : kind}.${ext}`);
  if (!r.ok) return res.status(r.status).end();
  const buf = Buffer.from(await r.arrayBuffer());
  res.set("Cache-Control", "no-cache").set("Content-Type", ext === "png" ? "image/png" : "image/bmp");
  if (ext === "bmp") res.set("Content-Disposition", `attachment; filename="${kind}-${req.query.d || "today"}.bmp"`);
  res.send(buf);
}));

// ---------- /medicare ----------
const CARRIERS = ["Devoted", "UHC", "Humana", "HMSA", "CMS", "Other"];
const strOrNull = (v, max) => (v == null || v === "" ? null : String(v).slice(0, max));
const isDay = (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(String(v));

app.get("/api/medicare", requireAuth, wrap(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await mstore.getAll(localDate(req)));
}));

app.patch("/api/medicare/pulse/:id", requireAuth, wrap(async (req, res) => {
  if (!["New", "Read", "Acted", "Archived"].includes(req.body.status)) return res.status(400).json({ error: "status" });
  res.json(await mstore.setPulse(req.params.id, { status: req.body.status }));
}));

function campaignFields(b) {
  const f = {};
  if ("name" in b) { f.name = String(b.name || "").trim().slice(0, 140); if (!f.name) throw Object.assign(new Error("name"), { status: 400 }); }
  if ("channel" in b) { if (!["Kiosk", "Mailer", "Social", "Event", "Seminar", "Referral", "Other"].includes(b.channel)) throw Object.assign(new Error("channel"), { status: 400 }); f.channel = b.channel; }
  if ("carriers" in b) f.carriers = (Array.isArray(b.carriers) ? b.carriers : []).filter((c) => ["Devoted", "UHC", "Humana", "Multi"].includes(c));
  for (const k of ["start", "end"]) if (k in b) { if (!isDay(b[k] || null)) throw Object.assign(new Error(k), { status: 400 }); f[k] = b[k] || null; }
  for (const k of ["cost", "pieces"]) if (k in b) { const v = b[k] === "" || b[k] == null ? null : Number(b[k]); if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1e7)) throw Object.assign(new Error(k), { status: 400 }); f[k] = v; }
  if ("status" in b) { if (!["Planned", "Running", "Done"].includes(b.status)) throw Object.assign(new Error("status"), { status: 400 }); f.status = b.status; }
  for (const k of ["notes", "tracking", "match"]) if (k in b) f[k] = String(b[k] || "").slice(0, 2000);
  return f;
}
app.patch("/api/medicare/campaign/:id", requireAuth, wrap(async (req, res) => res.json(await mstore.updateCampaign(req.params.id, campaignFields(req.body)))));
app.post("/api/medicare/campaign", requireAuth, wrap(async (req, res) => {
  const f = campaignFields(req.body);
  if (!f.name) return res.status(400).json({ error: "name" });
  res.json(await mstore.createCampaign({ status: "Running", ...f }));
}));

app.patch("/api/medicare/content/:id", requireAuth, wrap(async (req, res) => {
  const b = req.body, f = {};
  if ("status" in b) { if (!["Requested", "Draft", "Ready", "Posted"].includes(b.status)) return res.status(400).json({ error: "status" }); f.status = b.status; }
  if ("postDate" in b) { if (!isDay(b.postDate || null)) return res.status(400).json({ error: "postDate" }); f.postDate = b.postDate || null; }
  if ("compliance" in b) { if (b.compliance !== null && !["Educational - no plan named", "Needs carrier approval", "Approved"].includes(b.compliance)) return res.status(400).json({ error: "compliance" }); f.compliance = b.compliance; }
  for (const k of ["ig", "fb", "cta", "summary", "brief", "materialId"]) if (k in b) f[k] = String(b[k] || "").slice(0, 4000);
  if (f.status === "Posted" && !("postDate" in f)) f.postDate = localDate(req);
  res.json(await mstore.updateContent(req.params.id, f));
}));

// A new post: a line about it, optionally one photo (JPEG/PNG/WebP, resized on the phone first).
app.post("/api/medicare/content", requireAuth, wrap(async (req, res) => {
  const b = req.body;
  const title = String(b.title || "").trim().slice(0, 140);
  const kind = b.kind;
  if (!title) return res.status(400).json({ error: "title" });
  if (!["In the field", "Educational", "Mailer follow-up", "Event promo", "Carrier news"].includes(kind)) return res.status(400).json({ error: "kind" });
  let image = null;
  if (b.image) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image));
    if (!m) return res.status(400).json({ error: "image" });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 9 * 1024 * 1024) return res.status(413).json({ error: "That photo is too large. Try a smaller one." });
    const ext = m[1].split("/")[1].replace("jpeg", "jpg");
    image = { buf, type: m[1], name: `${localDate(req)}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.${ext}` };
  }
  res.json(await mstore.createContent({ title, kind, brief: String(b.brief || "").slice(0, 2000), campaign: strOrNull(b.campaign, 64), image }));
}));

app.patch("/api/medicare/partner/:id", requireAuth, wrap(async (req, res) => {
  const b = req.body, f = {};
  if ("nextStep" in b) f.nextStep = String(b.nextStep || "").slice(0, 1000);
  if ("disruption" in b) { if (b.disruption !== null && !["HMSA plan closing", "Humana changes", "Devoted fit", "None known"].includes(b.disruption)) return res.status(400).json({ error: "disruption" }); f.disruption = b.disruption; }
  if ("networks" in b) f.networks = (Array.isArray(b.networks) ? b.networks : []).filter((c) => ["Devoted", "UHC", "Humana", "HMSA", "Unknown"].includes(c));
  if ("contacted" in b && b.contacted) f.lastContact = localDate(req);
  res.json(await mstore.updatePartner(req.params.id, f));
}));

// Carrier Portals: Ready to Sell, "checked today", and the login (email or username) and where
// the password lives. Never the password itself.
app.patch("/api/medicare/portal/:id", requireAuth, wrap(async (req, res) => {
  const b = req.body, f = {};
  if ("rts" in b) { if (b.rts !== null && !["Ready to sell", "Action needed", "Pending", "n/a"].includes(b.rts)) return res.status(400).json({ error: "rts" }); f.rts = b.rts; }
  if ("checked" in b && b.checked) f.lastChecked = localDate(req);
  for (const k of ["login", "hint", "notes", "support"]) if (k in b) f[k] = String(b[k] || "").slice(0, 500);
  if ("website" in b) { const u = String(b.website || "").trim(); if (u && !/^https:\/\/[^\s]+$/i.test(u)) return res.status(400).json({ error: "website" }); f.website = u || null; }
  res.json(await mstore.updatePortal(req.params.id, f));
}));

// Medicare Calls: Eric's call log from the Calls tab. The list itself is written by Claude; only the
// log fields are accepted here. The first outcome stamps Called at.
const CALL_OUTCOMES = ["Reached", "Left voicemail", "No answer", "Wrong number", "Call back later", "Booked appointment", "Enrolled", "Staying put", "Not interested"];
app.patch("/api/medicare/call/:id", requireAuth, wrap(async (req, res) => {
  const b = req.body, f = {};
  if ("outcome" in b) {
    if (b.outcome !== null && b.outcome !== "" && !CALL_OUTCOMES.includes(b.outcome)) return res.status(400).json({ error: "outcome" });
    f.outcome = b.outcome || null;
    if (f.outcome && b.stamp) f.calledAt = new Date().toISOString();
  }
  // Tapping Call stamps Dialed at; during a session the call also carries the session's Key.
  if (b.dialed) f.dialedAt = new Date().toISOString();
  if ("session" in b) { const k = String(b.session || ""); if (k && !/^sess-\d{8}-\d{4}$/.test(k)) return res.status(400).json({ error: "session" }); f.session = k; }
  for (const k of ["recording", "verified", "disclaimer", "soa", "plaud"]) if (k in b) f[k] = !!b[k];
  if ("nextDate" in b) { if (!isDay(b.nextDate || null)) return res.status(400).json({ error: "nextDate" }); f.nextDate = b.nextDate || null; }
  for (const [k, max] of [["nextStep", 300], ["notes", 1900], ["newEmail", 200], ["newAddress", 300], ["newPhone", 40]]) if (k in b) f[k] = String(b[k] || "").slice(0, max);
  res.json(await mstore.updateCall(req.params.id, f));
}));

// Call sessions: Start stamps Started and names the session in Hawaii time; End stamps Ended and
// stores the counts the Calls tab worked out from the calls carrying the session's Key.
const hst = (d, o) => new Intl.DateTimeFormat("en-US", { timeZone: "Pacific/Honolulu", ...o }).format(d);
app.post("/api/medicare/call-session", requireAuth, wrap(async (req, res) => {
  const now = new Date();
  const ymd = hst(now, { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/(\d+)\/(\d+)\/(\d+)/, "$3$1$2");
  const hm = hst(now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(":", "");
  res.json(await mstore.createCallSession({
    name: "Calls · " + hst(now, { weekday: "short", month: "short", day: "numeric" }) + ", " + hst(now, { hour: "numeric", minute: "2-digit" }),
    key: `sess-${ymd}-${hm}`, started: now.toISOString(),
  }));
}));
app.patch("/api/medicare/call-session/:id", requireAuth, wrap(async (req, res) => {
  const b = req.body, f = {};
  if (b.end) f.ended = new Date().toISOString();
  if (b.reopen) f.ended = null;
  for (const k of ["dialed", "reached", "voicemail", "noAnswer", "booked", "plaudNotes", "minutes"]) if (k in b) { const n = Number(b[k]); if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: k }); f[k] = Math.round(n); }
  if ("note" in b) f.note = String(b.note || "").slice(0, 1000);
  res.json(await mstore.updateCallSession(req.params.id, f));
}));

// Photos and thumbnails are private Notion files with short-lived URLs, so they come through here.
const PLACEHOLDER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#EDECE6"/><path d="M30 64 L44 48 L54 58 L62 50 L72 64 Z" fill="#D6D5CC"/><circle cx="62" cy="38" r="5" fill="#D6D5CC"/></svg>');
app.get("/api/medicare/img/:id", requireAuth, wrap(async (req, res) => {
  const prop = req.query.p === "Thumbnail" ? "Thumbnail" : "Photo";
  const i = Math.max(0, Math.min(9, Number(req.query.i) || 0));
  const url = await mstore.fileUrl(req.params.id, prop, i);
  if (!url) { res.set("Content-Type", "image/svg+xml"); res.set("Cache-Control", "no-store"); return res.send(PLACEHOLDER); }
  const r = await fetch(url);
  if (!r.ok) return res.status(502).end();
  res.set("Content-Type", r.headers.get("content-type") || "image/jpeg");
  res.set("Cache-Control", "private, max-age=1800");
  res.send(Buffer.from(await r.arrayBuffer()));
}));

// ---------- /flown ----------
// Eric's FLOWN focus sessions (Tim's community): the ritual, the blocks, the tasks he pulls in from
// the brief, and the members' words. Private to him like the rest of Oggi.
const isTime = (v) => v === null || v === undefined || (typeof v === "string" && !isNaN(Date.parse(v)));
function sessionFields(b) {
  const f = {};
  for (const k of ["title", "host", "word", "intention", "gratitude"]) if (k in b) f[k] = String(b[k] || "").slice(0, k === "gratitude" || k === "intention" ? 1500 : 120);
  if ("join" in b) f.join = /^https:\/\//.test(String(b.join || "")) ? String(b.join).slice(0, 500) : null;
  if ("start" in b && isTime(b.start)) { f.start = b.start || null; if ("end" in b && isTime(b.end)) f.end = b.end || null; }
  if ("breathwork" in b) f.breathwork = !!b.breathwork;
  if ("blocks" in b && Array.isArray(b.blocks)) f.blocks = b.blocks;
  if ("quotes" in b && Array.isArray(b.quotes)) f.quotes = b.quotes;
  if ("status" in b && ["Planned", "Done", "Skipped"].includes(b.status)) f.status = b.status;
  if ("calendarId" in b) f.calendarId = b.calendarId ? String(b.calendarId).slice(0, 200) : null;
  return f;
}
function memberFields(b) {
  const f = {};
  for (const k of ["name", "word", "meaning", "note"]) if (k in b) f[k] = String(b[k] || "").slice(0, k === "note" ? 600 : 120);
  if ("role" in b && ["Me", "Host", "Member"].includes(b.role)) f.role = b.role;
  if ("since" in b && isDay(b.since || null)) f.since = b.since || null;
  return f;
}
app.get("/api/flown", requireAuth, wrap(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await fstore.getAll(localDate(req)));
}));
app.post("/api/flown/session", requireAuth, wrap(async (req, res) => {
  const f = sessionFields(req.body);
  if (!f.title || !f.start) return res.status(400).json({ error: "title and start" });
  res.json(await fstore.createSession(f));
}));
app.patch("/api/flown/session/:id", requireAuth, wrap(async (req, res) => res.json(await fstore.updateSession(req.params.id, sessionFields(req.body)))));
app.delete("/api/flown/session/:id", requireAuth, wrap(async (req, res) => res.json(await fstore.removeSession(req.params.id))));
app.post("/api/flown/member", requireAuth, wrap(async (req, res) => {
  const f = memberFields(req.body);
  if (!f.name) return res.status(400).json({ error: "name" });
  res.json(await fstore.createMember(f));
}));
app.patch("/api/flown/member/:id", requireAuth, wrap(async (req, res) => res.json(await fstore.updateMember(req.params.id, memberFields(req.body)))));
app.delete("/api/flown/member/:id", requireAuth, wrap(async (req, res) => res.json(await fstore.removeMember(req.params.id))));
app.get("/flown", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "flown.html"));
});

// ---------- /feeding ----------
// The Nov 11 SCE lunch for 70 at Kingdom Hall C: dishes and cooks, supplies, the timeline, notes.
// One Notion table (Feeding), one row per thing. Private to Eric like the rest of Oggi.
const FEED_KINDS = ["Dish", "Supply", "Step", "Note"];
function feedFields(b) {
  const f = {};
  const lim = { name: 200, who: 120, amount: 160, cat: 60, time: 40, needs: 400, notes: 4000 };
  for (const k of Object.keys(lim)) if (k in b) f[k] = String(b[k] ?? "").slice(0, lim[k]);
  if ("kind" in b && FEED_KINDS.includes(b.kind)) f.kind = b.kind;
  if ("order" in b && Number.isFinite(Number(b.order))) f.order = Number(b.order);
  if ("status" in b && ["asked", "confirmed", "cooking", "delivered"].includes(b.status)) f.status = b.status;
  if ("source" in b && ["costco", "borrow", "have", "cook"].includes(b.source)) f.source = b.source;
  if ("day" in b && ["prep", "event", "after"].includes(b.day)) f.day = b.day;
  for (const k of ["got", "returned", "fixed", "done"]) if (k in b) f[k] = !!b[k];
  if ("checks" in b && Array.isArray(b.checks)) f.checks = b.checks.map(String).slice(0, 10);
  return f;
}
app.get("/api/feeding", requireAuth, wrap(async (req, res) => { res.set("Cache-Control", "no-store"); res.json(await feedstore.getAll()); }));
app.post("/api/feeding", requireAuth, wrap(async (req, res) => {
  const f = feedFields(req.body);
  if (!f.kind || !f.name) return res.status(400).json({ error: "kind and name" });
  res.json(await feedstore.create(f));
}));
app.patch("/api/feeding/:id", requireAuth, wrap(async (req, res) => res.json(await feedstore.update(req.params.id, feedFields(req.body)))));
app.delete("/api/feeding/:id", requireAuth, wrap(async (req, res) => res.json(await feedstore.remove(req.params.id))));
app.get("/feeding", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "feeding.html"));
});

// ---------- /coach (Roger) ----------
app.get("/api/coach", requireAuth, wrap(async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (DEMO) return res.json({ today: null, yesterday: { day: "", win: "Two enrollments: Henry and Thelma.", rogerMorning: "", rogerPick: "", habits: {} }, streaks: {}, books: [{ title: "Atomic Habits", author: "James Clear", chapter: "", themes: ["Habits"] }] });
  try { res.json(await coach.getAll(localDate(req))); }
  catch (e) { if (e.status === 404 || e.status === 403) return res.json({ error: "share" }); throw e; }
}));
app.post("/api/coach", requireAuth, wrap(async (req, res) => {
  const b = req.body || {}, f = {};
  for (const k of ["win", "grateful", "book", "chapter", "notes", "apply", "tomorrow"]) if (k in b) f[k] = String(b[k] || "").slice(0, 4000);
  if (b.habits && typeof b.habits === "object") { f.habits = {}; for (const h of coach.HABITS) if (h in b.habits) f.habits[h] = !!b.habits[h]; }
  if ("water" in b) f.water = b.water === "" || b.water == null ? null : Math.max(0, Math.min(20, Number(b.water) || 0));
  if ("mood" in b) { if (b.mood && !["Great", "Good", "Okay", "Rough"].includes(b.mood)) throw bad("mood"); f.mood = b.mood || null; }
  if ("checkedOut" in b) f.checkedOut = !!b.checkedOut;
  if (DEMO) return res.json({ ok: true });
  res.json(await coach.save(localDate(req), f));
}));
app.get(["/coach", "/coach/*"], (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "coach.html"));
});

// ---------- /italian ----------
// Eric's Italian lessons: the word index (counted once per day), the lessons, and a reader that
// marks the words he already knows in anything he pastes or uploads.
const clip = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
const IT_SESSIONS = ["Wednesday night", "Sunday morning", "Extra", "Self-study"];
app.get("/api/italian", requireAuth, wrap(async (req, res) => { res.set("Cache-Control", "no-store"); res.json({ ...(await istore.getAll(localDate(req))), teacherPin: !!(await teacherHash()) }); }));
app.post("/api/italian/word", requireAuth, wrap(async (req, res) => {
  const italian = clip(req.body.italian, 120);
  if (!italian || !/\p{L}/u.test(italian)) throw bad("italian");
  const lessonId = req.body.lessonId ? String(req.body.lessonId).slice(0, 64) : null;
  res.json(await istore.addWord({ italian, english: clip(req.body.english, 200), lessonId }, localDate(req)));
}));
app.patch("/api/italian/word/:id", requireAuth, wrap(async (req, res) => {
  const b = req.body, f = {};
  if ("status" in b) { if (!["New", "Learning", "Known"].includes(b.status)) throw bad("status"); f.status = b.status; }
  for (const [k, n] of [["english", 200], ["note", 600], ["example", 400]]) if (k in b) f[k] = clip(b[k], n);
  res.json(await istore.updateWord(req.params.id, f));
}));
app.post("/api/italian/seen", requireAuth, wrap(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(String))].slice(0, 150) : [];
  res.json(await istore.markSeen(ids, localDate(req)));
}));
app.post("/api/italian/lesson", requireAuth, wrap(async (req, res) => {
  const session = IT_SESSIONS.includes(req.body.session) ? req.body.session : "Extra";
  const extra = {};
  if (session === "Self-study") {
    const m = Math.round(Number(req.body.minutes));
    if (!(m > 0 && m <= 600)) throw bad("minutes");
    extra.minutes = m;
    if (req.body.note) extra.note = clip(req.body.note, 300);
  }
  res.json(await istore.lessonFor(localDate(req), session, clip(req.body.name, 80) || "Lesson", extra));
}));
app.patch("/api/italian/lesson/:id", requireAuth, wrap(async (req, res) => res.json(await istore.updateLesson(req.params.id, { note: clip(req.body.note, 1500) }))));
// A PDF comes up as raw bytes; pdf.js pulls its text on the server so the page's CSP stays strict.
app.post("/api/italian/pdf", requireAuth, express.raw({ type: "application/pdf", limit: "15mb" }), wrap(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.subarray(0, 5).toString() !== "%PDF-") throw bad("not a PDF");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(req.body), disableFontFace: true, isEvalSupported: false, useSystemFonts: false }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map((it) => (it.str || "") + (it.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+/g, " ").trim());
  }
  res.json({ text: pages.join("\n\n").slice(0, 200000), pages: doc.numPages });
}));
// Eric's side of assignments: requests to Claude (made on the next Italian brief), writing for the
// teacher to correct, answers and quiz scores.
const IT_KINDS_OWNER = ["Request", "Writing"];
app.post("/api/italian/assign", requireAuth, wrap(async (req, res) => {
  const kind = IT_KINDS_OWNER.includes(req.body.kind) ? req.body.kind : null;
  if (!kind) throw bad("kind");
  const body = String(req.body.body || "").slice(0, 6000).trim();
  if (!body) throw bad("body");
  res.json(await istore.createAssign({ kind, from: "Eric", status: kind === "Request" ? "Queued" : "Submitted", title: clip(req.body.title, 120) || clip(body, 60), body }));
}));
app.patch("/api/italian/assign/:id", requireAuth, wrap(async (req, res) => {
  const a = await istore.getAssign(req.params.id);
  if (!a || a.kind === "Access") throw bad("not found");
  const b = req.body, f = {};
  if ("answer" in b) f.answer = String(b.answer || "").slice(0, 6000);
  if ("status" in b) { if (!["Submitted", "Done", "Archived", "Assigned"].includes(b.status)) throw bad("status"); f.status = b.status; if (b.status === "Done" || b.status === "Submitted") f.doneOn = localDate(req); }
  if ("score" in b) { const n = Number(b.score); if (!(n >= 0 && n <= 100)) throw bad("score"); f.score = Math.round(n); }
  if (a.from === "Eric" && "body" in b) f.body = String(b.body || "").slice(0, 6000);
  res.json(await istore.updateAssign(a.id, f));
}));

// ---- the teacher: a PIN page at /italian/teacher, nothing else in Oggi ----
// The PIN is set by Eric on /italian and kept as a salted scrypt hash in Notion. A teacher session is
// its own cookie, scoped to /api/italian/t, and stops working the moment Eric changes or removes the PIN.
let tCache = { at: 0, hash: null };
async function teacherHash() {
  if (Date.now() - tCache.at < 60_000) return tCache.hash;
  const a = await istore.getAccess().catch(() => null);
  tCache = { at: Date.now(), hash: a && a.hash ? a.hash : null };
  return tCache.hash;
}
const pinVersion = (hash) => crypto.createHash("sha256").update(hash).digest("base64url").slice(0, 16);
function checkPin(pin, hash) {
  const [salt, want] = String(hash).split(":");
  if (!salt || !want) return false;
  const got = crypto.scryptSync(String(pin), Buffer.from(salt, "base64url"), 32);
  const w = Buffer.from(want, "base64url");
  return w.length === got.length && crypto.timingSafeEqual(got, w);
}
app.post("/api/italian/teacher-pin", requireAuth, wrap(async (req, res) => {
  if (req.body.off) { await istore.setAccess(""); tCache = { at: 0, hash: null }; return res.json({ on: false }); }
  const pin = String(req.body.pin || "").trim();
  if (!/^\d{6,8}$/.test(pin)) throw bad("Use 6 to 8 digits.");
  const salt = crypto.randomBytes(16);
  await istore.setAccess(salt.toString("base64url") + ":" + crypto.scryptSync(pin, salt, 32).toString("base64url"));
  tCache = { at: 0, hash: null };
  res.json({ on: true });
}));
const tFails = new Map(); // ip -> { n, until }
let tGlobal = { n: 0, since: Date.now(), until: 0 };
app.post("/auth/italian-teacher", wrap(async (req, res) => {
  const now = Date.now();
  if (now - tGlobal.since > 3600_000) tGlobal = { n: 0, since: now, until: 0 };
  if (tGlobal.until > now) return res.status(429).json({ error: "Too many wrong PINs. Try again in an hour." });
  const ip = req.ip || "?";
  const f = tFails.get(ip) || { n: 0, until: 0 };
  if (f.until > now) return res.status(429).json({ error: `Too many wrong tries. Try again in ${Math.ceil((f.until - now) / 60000)} minutes.` });
  const hash = await teacherHash();
  if (!hash) return res.status(503).json({ error: "Teacher access isn't turned on." });
  if (!checkPin(String(req.body.pin || "").trim(), hash)) {
    f.n += 1; if (f.n >= 5) { f.until = now + 15 * 60_000; f.n = 0; }
    tFails.set(ip, f);
    tGlobal.n += 1; if (tGlobal.n >= 20) tGlobal.until = now + 3600_000;
    return res.status(401).json({ error: "That PIN isn't right." });
  }
  tFails.delete(ip);
  const t = sign({ k: "teacher", v: pinVersion(hash), exp: now + 120 * 24 * 3600_000 });
  const secure = BASE_URL.startsWith("https") ? "; Secure" : "";
  res.set("Set-Cookie", `oggi_it=${encodeURIComponent(t)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${120 * 24 * 3600}${secure}`);
  res.json({ ok: true });
}));
app.post("/auth/italian-teacher/signout", (req, res) => { res.set("Set-Cookie", "oggi_it=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"); res.json({ ok: true }); });
function requireTeacher(req, res, next) {
  const p = verify(cookie(req, "oggi_it"));
  if (!p || p.k !== "teacher") return res.status(401).json({ error: "pin" });
  teacherHash().then((hash) => (hash && p.v === pinVersion(hash) ? next() : res.status(401).json({ error: "pin" })), () => res.status(502).json({ error: "failed" }));
}
const T_EDIT = ["Assignment", "Text", "Writing", "Quiz"];
app.get("/api/italian/t", requireTeacher, wrap(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const all = await istore.getAll(localDate(req));
  res.json({ words: all.words, lessons: all.lessons.map(({ plaud, ...l }) => l), events: all.events, assignments: all.assignments.filter((a) => T_EDIT.includes(a.kind)) });
}));
app.post("/api/italian/t/assign", requireTeacher, wrap(async (req, res) => {
  const kind = ["Assignment", "Text"].includes(req.body.kind) ? req.body.kind : "Assignment";
  const title = clip(req.body.title, 120), body = String(req.body.body || "").slice(0, 8000).trim();
  if (!title || !body) throw bad("title and text");
  const due = /^\d{4}-\d{2}-\d{2}$/.test(req.body.due || "") ? req.body.due : null;
  res.json(await istore.createAssign({ kind, from: "Teacher", status: "Assigned", title, body, due }));
}));
app.patch("/api/italian/t/assign/:id", requireTeacher, wrap(async (req, res) => {
  const a = await istore.getAssign(req.params.id);
  if (!a || !T_EDIT.includes(a.kind)) throw bad("not found");
  const b = req.body, f = {};
  if (a.from === "Teacher") {
    if ("title" in b) f.title = clip(b.title, 120);
    if ("body" in b) f.body = String(b.body || "").slice(0, 8000);
    if ("due" in b) f.due = /^\d{4}-\d{2}-\d{2}$/.test(b.due || "") ? b.due : null;
  }
  if ("correction" in b) f.correction = String(b.correction || "").slice(0, 8000);
  if ("feedback" in b) f.feedback = String(b.feedback || "").slice(0, 3000);
  if ("status" in b) { if (!["Reviewed", "Archived", "Assigned"].includes(b.status)) throw bad("status"); f.status = b.status; }
  res.json(await istore.updateAssign(a.id, f));
}));
app.post("/api/italian/t/word", requireTeacher, wrap(async (req, res) => {
  const italian = clip(req.body.italian, 120);
  if (!italian || !/\p{L}/u.test(italian)) throw bad("italian");
  res.json(await istore.addWord({ italian, english: clip(req.body.english, 200), lessonId: null }, localDate(req)));
}));
app.get(["/italian", "/italian/*"], (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "italian.html"));
});

app.get(["/medicare", "/medicare/*"], (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "medicare.html"));
});

// ---------- /cpa ----------
const CPA = {
  entity: ["S corp", "LLC", "Sole prop", "C corp", "Partnership", "Individual", "Trust"],
  cadence: ["Monthly", "Quarterly", "Annual", "As needed"],
  services: ["Bookkeeping", "Payroll", "GE tax", "Estimates", "Business return", "Personal return", "Advisory", "Sales tax"],
  cstatus: ["Active", "Paused", "Former"],
  type: ["Monthly", "Quarterly", "Year-end", "Annual", "Ad hoc"],
  mstatus: ["Planned", "Prepped", "Held", "Followed up", "Cancelled"],
};
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const isUrl = (v) => v === null || /^https?:\/\/\S+$/.test(String(v));
const isWhen = (v) => v === null || /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:\d{2}|Z)?)?$/.test(String(v));
function cpaClientFields(b) {
  const f = {};
  if ("name" in b) { f.name = String(b.name || "").trim().slice(0, 140); if (!f.name) throw bad("name"); }
  if ("owner" in b) f.owner = String(b.owner || "").slice(0, 140);
  for (const [k, list] of [["entity", CPA.entity], ["cadence", CPA.cadence], ["status", CPA.cstatus]]) if (k in b) { if (b[k] && !list.includes(b[k])) throw bad(k); f[k] = b[k] || null; }
  if ("services" in b) f.services = (Array.isArray(b.services) ? b.services : []).filter((x) => CPA.services.includes(x));
  if ("through" in b) { if (!isDay(b.through || null)) throw bad("through"); f.through = b.through || null; }
  for (const k of ["ytdRevenue", "ytdNet", "projectedNet", "priorTax", "fedPaid", "statePaid", "withholding"]) if (k in b) {
    const v = b[k] === "" || b[k] == null ? null : Number(b[k]); if (v !== null && (!Number.isFinite(v) || Math.abs(v) > 1e9)) throw bad(k); f[k] = v;
  }
  for (const k of ["estimateCall", "watch", "notes"]) if (k in b) f[k] = String(b[k] || "").slice(0, 4000);
  for (const k of ["qbo", "taxdome"]) if (k in b) { const v = b[k] || null; if (!isUrl(v)) throw bad(k); f[k] = v; }
  return f;
}
function cpaMeetingFields(b) {
  const f = {};
  if ("title" in b) { f.title = String(b.title || "").trim().slice(0, 140); if (!f.title) throw bad("title"); }
  if ("when" in b) { if (!isWhen(b.when || null)) throw bad("when"); f.when = b.when || null; }
  for (const [k, list] of [["type", CPA.type], ["status", CPA.mstatus]]) if (k in b) { if (!list.includes(b[k])) throw bad(k); f[k] = b[k]; }
  if ("link" in b) { const v = b.link || null; if (!isUrl(v)) throw bad("link"); f.link = v; }
  if ("client" in b) { const v = b.client || null; if (v !== null && !/^[\w-]{8,64}$/.test(String(v))) throw bad("client"); f.client = v; }
  if ("agenda" in b) {
    if (b.agenda === null) f.agenda = null;
    else { if (!Array.isArray(b.agenda) || b.agenda.length > 40) throw bad("agenda"); f.agenda = b.agenda.map((x) => ({ t: String((x && x.t) || "").slice(0, 160), done: !!(x && x.done) })).filter((x) => x.t); }
  }
  for (const k of ["notes", "decisions", "followups"]) if (k in b) f[k] = String(b[k] || "").slice(0, 6000);
  return f;
}
app.get("/api/cpa", requireAuth, wrap(async (req, res) => { res.set("Cache-Control", "no-store"); res.json(await cstore.getAll()); }));
app.patch("/api/cpa/client/:id", requireAuth, wrap(async (req, res) => res.json(await cstore.updateClient(req.params.id, cpaClientFields(req.body)))));
app.post("/api/cpa/client", requireAuth, wrap(async (req, res) => { const f = cpaClientFields(req.body); if (!f.name) throw bad("name"); res.json(await cstore.createClient({ status: "Active", ...f })); }));
app.patch("/api/cpa/meeting/:id", requireAuth, wrap(async (req, res) => res.json(await cstore.updateMeeting(req.params.id, cpaMeetingFields(req.body)))));
app.post("/api/cpa/meeting", requireAuth, wrap(async (req, res) => { const f = cpaMeetingFields(req.body); if (!f.title) throw bad("title"); res.json(await cstore.createMeeting({ status: "Planned", type: "Ad hoc", ...f })); }));
app.get(["/cpa", "/cpa/*"], (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "cpa.html"));
});

// /leadhero: a ghost page for Aaron Burton (IFG). Public on purpose (no sign-in), not linked
// from the nav, noindex like everything else. No client names or contact details on it.
app.get(["/leadhero", "/leadhero/"], (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "leadhero.html"));
});

// ---------- static ----------
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, p) {
    if (p.endsWith("sw.js") || p.endsWith(".html")) res.set("Cache-Control", "no-cache");
  },
}));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`oggi on ${PORT}${DEMO ? " (demo data)" : ""}`));
