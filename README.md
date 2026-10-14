# Oggi

Eric's daily brief on the web — oggi.princellama.com.

Notion is the store. The morning, afternoon and evening brief runs (Claude) write two Notion tables; this app reads them and writes back what Eric does: notes, intentions, the evening choices, captures. Every edit is also appended to the day's **Edits since brief**, which the next brief run reads and the **Send to Claude** button carries into a new chat.

```
Claude (brief skill) ──writes──▶ Notion: Brief Days + Brief Items ◀──reads / edits── Oggi (this app)
                                  Notion: #QuickActions          ◀──captures, due dates──┘
```

## Views

- **Phone** — three panes you swipe between: **Now** (one thing: the next calendar event, then each open item), **Today** (the brief: terrain, acts, place map, Needs attention, Resolved, intentions), **Capture** (one line, Enter, becomes a QuickAction). After 7 pm, or when the brief's pass is Evening, Today becomes **What moves**: Tomorrow · This week · Let go per item, and one log line. **Read aloud** uses the phone's own voice.
- **Desktop** — the brief on the left, an editor on the right: title, note, place, the evening choice, done, links, capture, and the change list with **Send to Claude**. Keys: `j` `k` move · `t` tomorrow · `w` this week · `x` let go · `d` done · `n` note · `c` capture · `f` focus (Now, full screen) · `r` read aloud · `esc` back.
- **Now: Sort** — the sky's Sort button lays it out three ways, the planets flying to their new places: **Drive** (the place map), **Timeline** (a line across the day, each item at the time it would start, stepping round calendar events) and **By area** (CPA, Medicare, Money and Personal as suns with their items in orbit; Back / Next moves sun by sun). **Sort settings** sets the order (by priority, easiest first, eat that frog, shortest to longest), the start time, breaks, and each item's time and effort; times are guessed from titles (a tax return is two hours) until set. The timeline starts at the current time; optional entries and long blocks such as a port day don't push the work later. **⤢** makes the sky full screen: tapping a planet flies to it and floats its card over the sky (Back / Next inside the card, Esc or a tap on empty sky to close, arrow keys to move). A quiet focus timer sits in the sky's top-right corner, with **Breathe** and **Break** beside it: each opens a frosted, blurred veil over the sky (× or Esc to close). Break counts down the break length with a fresh nudge every 25 seconds (water, stretch, look far away, walk). Breathe offers Energize (4-2-2), Clear (box, 4-4-4-4) and Calm (4-7-8) for 1, 3 or 5 minutes, with an orb that swells on the in-breath and settles on the out-breath. Both end with Start a focus. All of this is kept on the device.
- **Where you are** (in Sort settings) — **Your time** is Automatic by default (the phone's own zone). When that's wrong, as on ship Wi-Fi or a VPN, pick the place instead (Japan, Korea, Hawaii…): the whole app then runs on that zone (clock, today's date, the timeline, the start time). **Remote Work mode** adds a home-base row (Hawaii by default) under each hour on the timeline. Kept on the device.
- **Outbox** — its own tab on phone and desktop: the People and Partners rows whose **Push to** is set and **Pushed** is empty, grouped as TaxDome and Axcess, GHL ready, Partners → GHL, Waiting on information, and Email gaps (folded). Copy one or a batch, **Mark pushed** (writes today into Pushed; Undo clears it), or **Have Claude enter these**, which opens a chat carrying only the Notion row links. Each push is also logged to the day's Edits since brief.
- Installable to the home screen; the last brief is cached so it opens on a weak signal.

## Notion

| Table | Data source | Who writes what |
| --- | --- | --- |
| Brief Days | `292f1929-9158-4c3f-8e80-80ad70cd4b13` | Claude: Name (date), Date, Pass, Shape, Headline, Map caption, Published, and a JSON code block in the page body (`acts`, `events`, `motifs`, `tomorrow`). App: Intentions, Log, Edits since brief. |
| Brief Items | `56605421-1249-4338-9a43-4ac9edc3bddc` | Claude: Title, Key, Place, Map label, List, Status, Order, Sentence, Source phrase, Link, Task, Carries, First seen, Last seen. App: Note, Decision, Decided at, Status (done), Title and Place when edited. |
| People | `47d42794-febb-4efb-9173-14a22ce848cb` | Outbox (read: Name, Push to, What changed, Pushed). App: Pushed only. |
| Partners | `fe50f233-8c9a-4d3c-bce1-ceab5dd05653` | Outbox, same as People. |
| #QuickActions | `15f8f469-b674-81ae-bbef-000bb207a508` | App: new task per capture (Status To Do, due today); Due Date moved by Tomorrow / This week; a line appended on Let go — nothing is ever deleted. |

The app shows the latest Brief Days row on or before today, with the Brief Items whose **Last seen** is that date.

## Environment variables (Railway → Variables)

| Name | Value |
| --- | --- |
| `NOTION_TOKEN` | The internal integration secret for "oggi". The five tables above must be shared with that integration. |
| `SESSION_SECRET` | Any long random string. Changing it signs everyone out. |
| `ALLOWED_EMAIL` | The address that may sign in (comma-separate more than one). |
| `OGGI_USER` | Username for PIN sign-in (not case-sensitive). |
| `OGGI_PIN` | The PIN. Five wrong tries lock a device out for 15 minutes; fifteen in an hour pause PIN sign-in for an hour. The email link always works as a fallback. |
| `RESEND_API_KEY` | A Resend key for princellama.com (the domain is already verified). |
| `MAIL_FROM` | `Oggi <oggi@princellama.com>` |
| `BASE_URL` | `https://oggi.princellama.com` |

No database. Sign-in is a one-time emailed link (15 minutes), then a 90-day signed cookie.

## Run it locally

```
npm install
npm run dev        # demo data, no Notion, no sign-in, http://localhost:8080
```

## Deploy

Same pattern as JIRO and Dolce: Railway web service from GitHub `Princellama/oggi`, custom domain `oggi.princellama.com` via a GoDaddy CNAME plus Railway's TXT verify record.
