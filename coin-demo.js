// In-memory stand-in for coin.js (OGGI_DEMO=1).
let n = 0;
const day = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return d.toISOString().slice(0, 10); };
const state = {
  cards: [
    { id: "c1", name: "Sapphire Preferred", apr: null, annualFee: 95, loginUrl: "https://secure.chase.com/web/auth/dashboard", perks: "5x on Chase Travel; 3x dining, online groceries and select streaming; 2x other travel.", useFor: ["Streaming"], issuer: "Chase", last4: "0188", balance: 5598.26, statement: 5242, minimum: 165, due: day(1), limit: 17800, autopay: "Minimum", interestYtd: 521.32, asOf: day(0), note: "", program: "Chase Ultimate Rewards", points: null, pointsAsOf: null, pointValue: 1.0 },
    { id: "c2", name: "Freedom Unlimited", apr: null, annualFee: 0, loginUrl: "https://secure.chase.com/web/auth/dashboard", perks: "1.5% on everything; 3% dining and drugstores. 3% foreign transaction fee.", useFor: ["Drugstores"], issuer: "Chase", last4: "3056", balance: 5980.83, statement: 5863.24, minimum: 58, due: day(7), limit: 13800, autopay: "Minimum", interestYtd: null, asOf: day(0), note: "", program: "Chase Ultimate Rewards", points: null, pointsAsOf: null, pointValue: 1.0 },
    { id: "c3", name: "United Explorer", apr: 25.24, annualFee: 150, loginUrl: "https://secure.chase.com/web/auth/dashboard", perks: "2x on United, dining and hotel stays; free first checked bag.", useFor: ["United flights"], issuer: "Chase", last4: "9683", balance: 6030.52, statement: 6030.52, minimum: 162, due: day(24), limit: 21400, autopay: "Minimum", interestYtd: null, asOf: day(0), note: "", program: "United MileagePlus", points: 50773, pointsAsOf: day(-3), pointValue: 1.2 },
    { id: "c4", name: "Prime Visa", apr: null, annualFee: 0, loginUrl: "https://secure.chase.com/web/auth/dashboard", perks: "5% Amazon and Whole Foods; 2% restaurants, gas, transit.", useFor: ["Amazon and Whole Foods", "Gas and transit"], issuer: "Chase", last4: "0528", balance: 1281.06, statement: 0, minimum: 0, due: null, limit: 17778, autopay: "Unknown", interestYtd: null, asOf: day(0), note: "", program: "Amazon rewards", points: null, pointsAsOf: null, pointValue: 1.0 },
    { id: "c5", name: "Amex Gold", apr: null, annualFee: 325, loginUrl: "https://www.americanexpress.com/en-us/account/login", perks: "4x restaurants and US supermarkets; 3x flights booked direct.", useFor: ["Dining", "US groceries", "Other flights"], issuer: "Amex", last4: "2006", balance: 0, statement: 0, minimum: 0, due: null, limit: null, autopay: "Unknown", interestYtd: null, asOf: day(0), note: "Paid in full.", program: "Amex Membership Rewards", points: 8287, pointsAsOf: day(-8), pointValue: 1.0 },
    { id: "c6", name: "Delta SkyMiles Reserve", apr: null, annualFee: 650, loginUrl: "https://www.americanexpress.com/en-us/account/login", perks: "3x on Delta; Sky Club visits; companion certificate.", useFor: ["Delta flights"], issuer: "Amex", last4: "1003", balance: 0, statement: 0, minimum: 0, due: null, limit: null, autopay: "Minimum", interestYtd: 1079.08, asOf: day(0), note: "", program: "Delta SkyMiles", points: 53239, pointsAsOf: day(-34), pointValue: 1.1 },
  ],
  payments: [
    { id: "p1", name: "Delta Reserve paid in full", card: "Delta SkyMiles Reserve ···1003", amount: 9556.38, date: day(0), from: "CPB checking ···6755", confirmation: "W1242", kind: "Payment" },
    { id: "p2", name: "Amex Gold paid in full", card: "Amex Gold ···2006", amount: 432.77, date: day(0), from: "CPB checking ···6755", confirmation: "W7306", kind: "Payment" },
    { id: "p3", name: "Sapphire autopay (minimum)", card: "Sapphire Preferred ···0188", amount: 165, date: day(1), from: "", confirmation: "", kind: "Autopay" },
  ],
  spending: [
    ["Travel", 10747.03, 13, [["Delta Air Lines", 5386.7, 3], ["Norwegian Cruise Line", 4824.32, 4]]],
    ["Shopping", 4680.27, 37, [["Costco", 1071.87, 7], ["Best Buy", 740.28, 3], ["Tori Richard, Kahala", 624.1, 1]]],
    ["Dining", 3912.26, 113, [["Starbucks", 1430, 33], ["The Lounge at Island", 227.85, 2]]],
    ["Interest and fees", 2345.4, 19, [["Interest charges", 1600.4, 17], ["Annual fees", 745, 2]]],
    ["Software and subscriptions", 2007.18, 55, [["Unlocked CRM", 785.7, 6], ["ChatGPT", 209.4, 10], ["RetireFlo", 200, 10]]],
    ["Business services", 1457.59, 7, [["ARC Document Solutions", 680.21, 2], ["USPS PO box", 306, 1]]],
    ["Transportation", 1203.21, 48, [["Tesla subscription", 518.3, 5], ["GO taxi app", 193.05, 9]]],
    ["Education", 790, 8, [["Preply", 790, 8]]],
  ].map(([name, amount, count, top], i) => ({ id: "s" + i, name, amount, count, period: "2026 to date", through: day(0), sources: "Amex Delta Reserve + Chase Sapphire", bucket: "Mixed", top: top.map(([m, a, k]) => ({ m, a, n: k })) })),
  reimbursements: [
    { id: "r1", name: "Gloria Chun funeral printing", amount: null, owedBy: "Norman Ching", card: "", spentOn: null, status: "Owed", note: "Not printed yet." },
  ],
};
async function getAll() { return JSON.parse(JSON.stringify(state)); }
async function createReimb(f) { const r = { id: "r" + (++n + 10), name: "", amount: null, owedBy: "", card: "", spentOn: null, status: "Owed", note: "", ...f }; state.reimbursements.push(r); return r; }
async function updateReimb(id, f) { const r = state.reimbursements.find((x) => x.id === id); Object.assign(r, f); return r; }
module.exports = { getAll, createReimb, updateReimb };
