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
- Installable to the home screen; the last brief is cached so it opens on a weak signal.

## Notion

| Table | Data source | Who writes what |
| --- | --- | --- |
| Brief Days | `292f1929-9158-4c3f-8e80-80ad70cd4b13` | Claude: Name (date), Date, Pass, Shape, Headline, Map caption, Published, and a JSON code block in the page body (`acts`, `events`, `motifs`, `tomorrow`). App: Intentions, Log, Edits since brief. |
| Brief Items | `56605421-1249-4338-9a43-4ac9edc3bddc` | Claude: Title, Key, Place, Map label, List, Status, Order, Sentence, Source phrase, Link, Task, Carries, First seen, Last seen. App: Note, Decision, Decided at, Status (done), Title and Place when edited. |
| #QuickActions | `15f8f469-b674-81ae-bbef-000bb207a508` | App: new task per capture (Status To Do, due today); Due Date moved by Tomorrow / This week; a line appended on Let go — nothing is ever deleted. |

The app shows the latest Brief Days row on or before today, with the Brief Items whose **Last seen** is that date.

## Environment variables (Railway → Variables)

| Name | Value |
| --- | --- |
| `NOTION_TOKEN` | The internal integration secret for "oggi". The three tables above must be shared with that integration. |
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
