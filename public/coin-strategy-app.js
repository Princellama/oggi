/* Oggi · /coin/strategy — Benefits Maximizer: how to get the most from Eric's cards.
   The strategy text lives here; live point balances and card names come from /api/coin.
   Everything is rendered with textContent. Facts checked Nov 2026; issuers change terms often. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false && kid !== "") el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const n = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US"));
  const usd = (v) => "$" + Math.round(v).toLocaleString("en-US");

  // ---------- title deeds: one per card. "rent" rows are the earn rates; credits are the free money. ----------
  const DEEDS = [
    { match: /gold/i, color: "yellow", name: "Amex Gold", fee: 325, apr: "24.74% (Pay Over Time only)",
      rent: [["Restaurants worldwide", "4x"], ["US supermarkets", "4x"], ["Flights booked direct or Amex Travel", "3x"], ["Prepaid hotels on Amex Travel", "2x"], ["Everything else", "1x"]],
      credits: ["$10/mo Uber Cash (add the card in the Uber app)", "$10/mo dining: Grubhub, Cheesecake Factory, Five Guys, Buffalo Wild Wings, Wonder", "Resy: up to $100 a year ($50 Jan–Jun, $50 Jul–Dec)", "$7/mo Dunkin' (reloading the Dunkin' app counts)"],
      tip: "Pay in full every month: it's a charge card at heart." },
    { match: /reserve/i, color: "red", name: "Delta SkyMiles Reserve", fee: 650, apr: "28.74%",
      rent: [["Delta purchases", "3x"], ["Everything else", "1x"]],
      credits: ["$20/mo Resy ($240 a year)", "$10/mo rideshare: Uber, Lyft ($120 a year)", "$200 a year on Delta Stays hotels", "Companion certificate each renewal (domestic, Mexico, Caribbean)", "Sky Club visits, free first bag, upgrade priority"],
      tip: "Worth $650 only if you use the Resy, rideshare and companion seat. Otherwise downgrade." },
    { match: /sapphire/i, color: "dkblue", name: "Sapphire Preferred", fee: 95, apr: "26.74%",
      rent: [["Chase Travel", "5x"], ["Dining", "3x"], ["Gas and EV charging", "3x"], ["Airbnb, Vrbo", "3x"], ["Streaming, online groceries", "3x"], ["Other travel", "2x"]],
      credits: ["$100 a year on hotels booked through Chase Travel", "Free DashPass", "Up to $120 for Global Entry or TSA PreCheck"],
      tip: "The key card: it unlocks transfers for all your Chase points, Freedom's included." },
    { match: /united/i, color: "ltblue", name: "United Explorer", fee: 150, apr: "25.24%",
      rent: [["United", "2x"], ["Dining", "2x"], ["Hotel stays", "2x"], ["Everything else", "1x"]],
      credits: ["$10/mo Instacart (through 12/31/27)", "$5/mo rideshare (opt in each year)", "$50 × 2 prepaid stays on United Hotels", "2 United Club passes a year", "Free first checked bag, Group 2 boarding", "$100 TravelBank after $10,000 spend in a year"],
      tip: "Buy United tickets with it so the free bag applies." },
    { match: /prime|amazon/i, color: "orange", name: "Prime Visa", fee: 0, apr: "22.99%",
      rent: [["Amazon, Whole Foods, Chase Travel", "5%"], ["Restaurants, gas, local transit", "2%"], ["Everything else", "1%"]],
      credits: ["No foreign transaction fee"], tip: "Amazon points can't transfer: spend them at Amazon." },
    { match: /freedom/i, color: "green", name: "Freedom Unlimited", fee: 0, apr: "0% promo (ends: check statement)",
      rent: [["Chase Travel", "5%"], ["Dining, drugstores", "3%"], ["Everything else", "1.5%"]],
      credits: ["Points pool into Sapphire, so they can be transferred to airlines"], tip: "Never use abroad: 3% foreign fee. Clear the balance before the 0% ends." },
    { match: /venture|capital/i, color: "pink", name: "Capital One Venture", fee: 59, apr: "26.65%",
      rent: [["Hotels, cars via Capital One Travel", "5x"], ["Everything else", "2x"]],
      credits: ["Global Entry / TSA PreCheck credit", "No foreign transaction fee"], tip: "Your catch-all and overseas card: 2x on anything." },
    { match: /blue/i, color: "brown", name: "Delta SkyMiles Blue", fee: 0, apr: "not checked",
      rent: [["Delta, restaurants", "2x"], ["Everything else", "1x"]],
      credits: ["No annual fee"], tip: "Keep it open for credit history; don't use it." },
  ];

  // ---------- Free Parking: credits to collect, by when they reset ----------
  const PARKING = [
    { when: "Every month", items: [
      ["Uber Cash", "Gold", 10, "Shows in the Uber app; use it on rides or Uber Eats."],
      ["Rideshare credit", "Delta Reserve", 10, "Pay Uber or Lyft with the Reserve after the Uber Cash is used."],
      ["Rideshare credit", "United Explorer", 5, "Opt in each January."],
      ["Resy credit", "Delta Reserve", 20, "Any eligible Resy restaurant; pay with the Reserve."],
      ["Dining credit", "Gold", 10, "Grubhub, Cheesecake Factory, Five Guys, Buffalo Wild Wings, Wonder."],
      ["Dunkin'", "Gold", 7, "Reload the Dunkin' app with the Gold."],
      ["Instacart", "United Explorer", 10, "Order through Instacart with the Explorer."],
    ] },
    { when: "Twice a year", items: [["Resy credit", "Gold", 50, "Jan–Jun and Jul–Dec. Enroll first."]] },
    { when: "Once a year", items: [
      ["Delta Stays hotel", "Delta Reserve", 200, "Book the hotel through delta.com/stays."],
      ["Chase Travel hotel", "Sapphire Preferred", 100, "Book through Chase Travel."],
      ["United Hotels", "United Explorer", 100, "$50 on each of the first two prepaid stays."],
      ["Companion certificate", "Delta Reserve", 0, "One companion seat after each renewal. Often worth $300–600."],
      ["United Club passes", "United Explorer", 0, "Two one-time lounge passes."],
    ] },
  ];

  // ---------- Resy on Oʻahu (Amex credit). Checked Nov 2026 from Resy-tracking lists. ----------
  const RESY = [
    ["@SUSHI", "Restaurant Row", "Japanese"], ["ADEZ Steakhouse & Lounge", "Kapahulu", "Steak"], ["Brix and Stones", "Kakaʻako", "Lounge, cigar bar"],
    ["Dragon Upstairs", "Chinatown", "Jazz bar (check badge)"], ["Empire Steakhouse Hawaii", "Waikīkī, Ilikai", "Steak"], ["Lava Lounge Waikiki", "Waikīkī", "Cocktail bar"],
    ["Nanzan Giro Giro", "Ala Moana", "Japanese kaiseki"], ["OKDONGSIK Hawaii", "Ala Moana", "Korean"], ["Olay's Thai Lao Cuisine", "Chinatown", "Thai and Lao"],
    ["Pigeonhole", "Chinatown", "Cocktail bar"], ["Rinka", "Kakaʻako", "Japanese"], ["Silver Lining Wine Bar", "Kakaʻako", "Natural wine"],
    ["Skull & Crown Trading Co.", "Chinatown", "Tiki bar"], ["Tanaka Ramen & Izakaya", "Ala Moana Center", "Ramen, izakaya"], ["Torishin Hawaii", "Kakaʻako", "Yakitori"],
    ["Toro", "Iwilei", "Sushi"], ["Vein at Kakaʻako", "Kakaʻako", "Japanese-Italian"], ["DOMODOMO Hawaii", "ʻEwa Beach", "Hand rolls, sushi"],
  ];

  // ---------- Railroads: who can move points where ----------
  const RAIL = [
    ["United MileagePlus", "Star Alliance", true, false, false],
    ["Air Canada Aeroplan", "Star Alliance", true, true, true],
    ["Air France / KLM Flying Blue", "SkyTeam", true, true, true],
    ["British Airways Avios", "oneworld", true, true, true],
    ["Iberia, Aer Lingus", "oneworld", true, true, false],
    ["Singapore KrisFlyer", "Star Alliance", true, true, true],
    ["Emirates, Virgin Atlantic", "none", true, true, true],
    ["Delta SkyMiles", "SkyTeam", false, true, false],
    ["ANA Mileage Club", "Star Alliance", false, true, false],
    ["Turkish Miles&Smiles", "Star Alliance", false, false, true],
    ["World of Hyatt (hotel)", "hotel", "4:3", false, false],
    ["Marriott, Hilton (hotel)", "hotel", true, true, false],
  ];

  const CHANCE = [
    ["Find the seats first.", "Search the airline for award seats, then transfer. Transfers can't be undone."],
    ["Transfer only what you need.", "Chase → United or Aeroplan usually arrives in minutes."],
    ["Wait for a bonus.", "Chase and Amex run 20–30% transfer bonuses a few times a year. Free extra points."],
    ["Use partners for Europe.", "United miles book Turkish, Lufthansa, Swiss, Austrian, with no fuel surcharges."],
    ["Try Aeroplan too.", "Same Star Alliance seats, often fewer points, and a stopover for about 5,000 points."],
    ["Skip Delta for Europe.", "Delta prices high and its partners add fuel surcharges."],
    ["Never take the statement credit.", "Amex pays 0.6¢ a point that way. Airlines get 1–2¢ or more."],
    ["Hyatt changed.", "Chase → Hyatt is now 4:3 (1,000 Chase points become 750 Hyatt)."],
  ];

  const JAIL = [
    ["Minimum autopay", "Sapphire, United and Delta Reserve are set to the minimum. Anything left over is charged 25–29%."],
    ["Freedom abroad", "3% foreign fee on every charge. Use the Venture or Sapphire overseas."],
    ["Carrying a balance", "At 28.74% the interest wipes out any points you earn. Points only win when you pay in full."],
    ["Unused credits", "Monthly credits vanish at month's end. Set a reminder on the 25th."],
  ];

  function deedFor(c) { return DEEDS.find((d) => d.match.test(c.name || "")); }

  function hero() {
    return h("section", { class: "bm-hero" },
      h("div", { class: "bm-corner" }, h("span", { text: "COLLECT" }), h("b", { text: "GO" }), h("span", { text: "← points" })),
      h("div", {},
        h("p", { class: "bm-kicker", text: "Coin · strategy" }),
        h("h1", { class: "bm-title", text: "Benefits Maximizer" }),
        h("p", { class: "bm-lede", text: "Every card is a property. Collect the credits, play the right card on each square, and move your points down the railroads to the airlines." })));
  }

  function deeds(cards) {
    const box = h("section", { class: "bm-sec", id: "deeds" }, h("h2", { class: "bm-h", text: "Title deeds" }), h("p", { class: "bm-sub", text: "What each card earns (the rent), what it gives back, and its fee." }));
    const grid = h("div", { class: "bm-deeds" });
    const list = cards.length ? cards.map((c) => ({ c, d: deedFor(c) })).filter((x) => x.d) : DEEDS.map((d) => ({ c: null, d }));
    list.sort((a, b) => DEEDS.indexOf(a.d) - DEEDS.indexOf(b.d));
    list.forEach(({ c, d }) => {
      grid.append(h("article", { class: "deed" },
        h("header", { class: "deed-top c-" + d.color }, h("small", { text: "TITLE DEED" }), h("b", { text: d.name }), c ? h("span", { text: "···" + c.last4 }) : ""),
        h("table", { class: "deed-rent" }, h("tbody", {}, ...d.rent.map(([k, v]) => h("tr", {}, h("td", { text: k }), h("td", { text: v }))))),
        h("ul", { class: "deed-credits" }, ...d.credits.map((t) => h("li", { text: t }))),
        h("p", { class: "deed-tip", text: d.tip }),
        h("footer", { class: "deed-foot" }, h("span", { text: d.fee ? `Annual fee ${usd(d.fee)}` : "No annual fee" }), h("span", { text: "APR " + d.apr }),
          c && /^https:\/\//.test(c.loginUrl || "") ? h("a", { href: c.loginUrl, target: "_blank", rel: "noopener noreferrer", text: "Log in ↗" }) : "")));
    });
    box.append(grid);
    return box;
  }

  function parking() {
    const box = h("section", { class: "bm-sec bm-parking", id: "parking" }, h("h2", { class: "bm-h", text: "Free Parking" }), h("p", { class: "bm-sub", text: "Credits waiting to be collected. Most need a one-time enrollment in the card's app." }));
    let monthly = 0, yearly = 0;
    PARKING.forEach((g) => {
      const rows = g.items.map(([what, card, amt, how]) => {
        if (g.when === "Every month") monthly += amt; yearly += g.when === "Every month" ? amt * 12 : g.when === "Twice a year" ? amt * 2 : amt;
        return h("div", { class: "pk" }, h("span", { class: "pk-amt", text: amt ? usd(amt) : "★" }), h("span", { class: "pk-w" }, h("b", { text: what }), h("small", { text: card })), h("span", { class: "pk-how", text: how }));
      });
      box.append(h("h3", { class: "bm-h3", text: g.when }), ...rows);
    });
    box.children[1].after(h("div", { class: "bm-pot" }, h("span", { text: "In the pot" }), h("b", { text: usd(monthly) + " a month" }), h("small", { text: `about ${usd(yearly)} a year, plus the companion seat and lounge passes` })));
    box.append(h("div", { class: "bm-stack" },
      h("b", { text: "Stack them" }),
      h("p", { text: "Uber: use the Gold's $10 Uber Cash first, then pay with the Delta Reserve ($10) and the United Explorer ($5). That's $25 of rides or Uber Eats every month." }),
      h("p", { text: "Resy: one dinner a month on the Reserve ($20) plus the Gold's $50 each half-year is about $340 a year at the same restaurants." })));
    return box;
  }

  function resy() {
    const box = h("section", { class: "bm-sec", id: "resy" }, h("h2", { class: "bm-h", text: "Resy on Oʻahu" }),
      h("p", { class: "bm-sub", text: "Restaurants where the Gold and Delta Reserve Resy credits work. Before paying, check that the restaurant's Resy page shows “Qualifies for Resy Credit”; the list changes." }));
    const grid = h("div", { class: "bm-resy" });
    RESY.forEach(([nm, area, kind]) => grid.append(h("div", { class: "rz" }, h("b", { text: nm }), h("span", { text: area }), h("small", { text: kind }))));
    box.append(grid, h("p", { class: "bm-note" }, "Live list: ", h("a", { href: "https://resy.com/cities/honolulu-hi", target: "_blank", rel: "noopener noreferrer", text: "resy.com · Honolulu ↗" }), ". No reservation needed; just pay with the card."));
    return box;
  }

  function railroads() {
    const box = h("section", { class: "bm-sec", id: "railroads" }, h("h2", { class: "bm-h", text: "Railroads" }), h("p", { class: "bm-sub", text: "Where each points program can travel. Most transfers are 1:1." }));
    const mark = (v) => (v === true ? "●" : v ? v : "");
    const t = h("table", { class: "bm-rail" },
      h("thead", {}, h("tr", {}, h("th", { text: "Airline / hotel" }), h("th", { text: "Alliance" }), h("th", { class: "rr c-dkblue", text: "Chase" }), h("th", { class: "rr c-green", text: "Amex" }), h("th", { class: "rr c-red", text: "Capital One" }))),
      h("tbody", {}, ...RAIL.map(([nm, al, a, b, c]) => h("tr", { class: a && b && c ? "all3" : "" }, h("td", { text: nm }), h("td", { class: "al", text: al }), h("td", { class: "dot", text: mark(a) }), h("td", { class: "dot", text: mark(b) }), h("td", { class: "dot", text: mark(c) })))));
    box.append(h("div", { class: "bm-scroll" }, t), h("p", { class: "bm-note", text: "Highlighted rows take points from all three programs: the place to pool everything for one big trip." }));
    return box;
  }

  function chance() {
    const box = h("section", { class: "bm-sec", id: "chance" }, h("h2", { class: "bm-h", text: "Chance" }), h("p", { class: "bm-sub", text: "The rules for moving points." }));
    const grid = h("div", { class: "bm-cards" });
    CHANCE.forEach(([t, d]) => grid.append(h("div", { class: "chance" }, h("span", { class: "q", text: "?" }), h("b", { text: t }), h("p", { text: d }))));
    box.append(grid);
    return box;
  }

  function chest(cards) {
    const box = h("section", { class: "bm-sec", id: "chest" }, h("h2", { class: "bm-h", text: "Community Chest" }), h("p", { class: "bm-sub", text: "Your points today, and where they could go for Europe 2027." }));
    const prog = new Map();
    cards.forEach((c) => { if (!c.program || c.points == null) return; const p = prog.get(c.program); if (!p || c.points > p) prog.set(c.program, c.points); });
    const get = (re) => { for (const [k, v] of prog) if (re.test(k)) return v; return 0; };
    const ur = get(/ultimate/i), mr = get(/membership/i), cap = get(/capital/i), ua = get(/mileageplus|united/i), dl = get(/skymiles|delta/i), amz = get(/amazon/i);
    const rows = [["Chase Ultimate Rewards", ur, "→ United or Aeroplan"], ["Amex Membership Rewards", mr, "→ Aeroplan or ANA"], ["Capital One miles", cap, "→ Aeroplan or Turkish"], ["United miles", ua, "already in United"], ["Delta SkyMiles", dl, "domestic Delta trips"], ["Amazon points", amz, "spend at Amazon only"]];
    box.append(h("div", { class: "bm-chest" }, ...rows.map(([k, v, w]) => h("div", { class: "cc" }, h("span", { text: k }), h("b", { class: "num", text: n(v) }), h("small", { text: w })))));
    const pool = ur + mr + cap;
    box.append(h("div", { class: "bm-plan" },
      h("b", { text: "Europe 2027 play" }),
      h("p", { text: `Aeroplan can take all three programs: about ${n(pool)} points pooled, plus ${n(ua)} United miles on the side.` }),
      h("ol", {},
        h("li", { text: "Pick dates, then search Turkish Airlines seats HNL → Istanbul on united.com and aircanada.com (Aeroplan)." }),
        h("li", { text: "Book whichever costs fewer points. Add a stopover on Aeroplan for about 5,000 points." }),
        h("li", { text: "Transfer just enough points, then book the same day." }),
        h("li", { text: "Budapest → Venice: short hops, often cheaper in cash or Avios." }))));
    return box;
  }

  function jail() {
    const box = h("section", { class: "bm-sec bm-jail", id: "jail" }, h("h2", { class: "bm-h", text: "Go to Jail" }), h("p", { class: "bm-sub", text: "Moves that cost you money. Do not pass Go." }));
    JAIL.forEach(([t, d]) => box.append(h("div", { class: "jl" }, h("b", { text: t }), h("p", { text: d }))));
    box.append(h("p", { class: "bm-note", text: "Facts checked November 2026. Card issuers change credits and partners often: confirm in the card's app before counting on one." }));
    return box;
  }

  async function load() {
    let cards = [];
    try {
      const r = await fetch("/api/coin", { credentials: "same-origin" });
      if (r.status === 401) { location.href = "/"; return; }
      if (r.ok) cards = (await r.json()).cards || [];
    } catch { /* show the static strategy without live balances */ }
    $("#main").replaceChildren(hero(), deeds(cards), parking(), resy(), railroads(), chance(), chest(cards), jail());
  }
  load();
})();
