// /coin — Eric's credit cards, payments, spending by category and reimbursements, in four Notion tables.
// Claude writes balances and spending from the statements; Oggi reads them and lets Eric
// mark reimbursements and add new ones. Last four digits only, never a full card number.

const N = require("./notion");
const { _call: call, _read: read, _rich: rich, _queryAll: queryAll } = N;

const DS = {
  cards: process.env.NOTION_COIN_CARDS_DS || "41c8f469-b674-81b4-b06a-000bba70a47e",
  ledger: process.env.NOTION_COIN_LEDGER_DS || "41c8f469-b674-8182-8cf5-000ba840a5bf",
  spending: process.env.NOTION_COIN_SPENDING_DS || "41c8f469-b674-81b6-95fd-000be2b34db5",
  reimb: process.env.NOTION_COIN_REIMB_DS || "41c8f469-b674-8100-90ce-000b703c10ff",
};
const num = (v) => (typeof v === "number" ? v : v == null || v === "" ? null : Number(v));

function parseTop(s) {
  const t = String(s || ""), i = t.indexOf("[");
  if (i < 0) return [];
  try { const a = JSON.parse(t.slice(i)); return Array.isArray(a) ? a.slice(0, 12).map((x) => ({ m: String(x.m || ""), a: Number(x.a) || 0, n: Number(x.n) || 0 })) : []; } catch { return []; }
}
const toCard = (pg) => { const p = pg.properties; return {
  id: pg.id, name: read(p["Name"]) || "", issuer: read(p["Issuer"]) || "Other", last4: read(p["Last4"]) || "",
  balance: num(read(p["Balance"])), statement: num(read(p["Statement balance"])), minimum: num(read(p["Minimum due"])),
  due: read(p["Due date"]), limit: num(read(p["Credit limit"])), autopay: read(p["Autopay"]) || "Unknown",
  interestYtd: num(read(p["Interest YTD"])), asOf: read(p["As of"]), note: read(p["Note"]) || "",
}; };
const toPay = (pg) => { const p = pg.properties; return {
  id: pg.id, name: read(p["Name"]) || "", card: read(p["Card"]) || "", amount: num(read(p["Amount"])), date: read(p["Date"]),
  from: read(p["From account"]) || "", confirmation: read(p["Confirmation"]) || "", kind: read(p["Kind"]) || "Payment",
}; };
const toCat = (pg) => { const p = pg.properties; return {
  id: pg.id, name: read(p["Name"]) || "", amount: num(read(p["Amount"])) || 0, count: num(read(p["Count"])) || 0,
  period: read(p["Period"]) || "", through: read(p["Through"]), sources: read(p["Sources"]) || "", bucket: read(p["Bucket"]) || "Mixed", top: parseTop(read(p["Top"])),
}; };
const toReimb = (pg) => { const p = pg.properties; return {
  id: pg.id, name: read(p["Name"]) || "", amount: num(read(p["Amount"])), owedBy: read(p["Owed by"]) || "", card: read(p["Card"]) || "",
  spentOn: read(p["Spent on"]), status: read(p["Status"]) || "Owed", note: read(p["Note"]) || "",
}; };

function reimbProps(f) {
  const props = {};
  if ("name" in f) props["Name"] = { title: rich(f.name) };
  if ("amount" in f) props["Amount"] = { number: f.amount };
  if ("owedBy" in f) props["Owed by"] = { rich_text: rich(f.owedBy) };
  if ("card" in f) props["Card"] = { rich_text: rich(f.card) };
  if ("spentOn" in f) props["Spent on"] = f.spentOn ? { date: { start: f.spentOn } } : { date: null };
  if ("status" in f) props["Status"] = { select: { name: f.status } };
  if ("note" in f) props["Note"] = { rich_text: rich(f.note) };
  return props;
}

async function getAll() {
  const [c, l, s, r] = await Promise.all([
    queryAll(DS.cards, {}), queryAll(DS.ledger, { sorts: [{ property: "Date", direction: "descending" }] }),
    queryAll(DS.spending, {}), queryAll(DS.reimb, {}),
  ]);
  return { cards: c.map(toCard), payments: l.map(toPay).slice(0, 40), spending: s.map(toCat), reimbursements: r.map(toReimb) };
}
async function createReimb(f) { return toReimb(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.reimb }, properties: reimbProps({ status: "Owed", ...f }) })); }
async function updateReimb(id, f) { return toReimb(await call("PATCH", `/pages/${id}`, { properties: reimbProps(f) })); }

module.exports = { getAll, createReimb, updateReimb, parseTop };
