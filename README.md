# My Day

Tay's daily list. Big type, big buttons, short words. Works on an iPhone home screen and on a computer.

The list is **not** stored on the Render disk. Render's free plan wipes that disk on every restart. Items are saved in the private repo [`simonpope82/my-day-data`](https://github.com/simonpope82/my-day-data), on the default branch `main`, in `items.json`. Set `DATA_REPO`, `DATA_BRANCH` and `DATA_PATH` to point somewhere else. A restart or a new deploy does not delete them.

## On iPhone

1. Open the site in Safari.
2. Tap Share.
3. Tap **Add to Home Screen**.
4. Open My Day from the icon.
5. Enter the code. It stays signed in on that phone.

The phone keyboard mic works in the add box. Say one line, then Save.

## What you can add

One line is enough:

- `pay electricity bill friday 1200kr`
- `ring tannlege i morgen`
- `forsikring hver måned 450kr`
- `eu-kontroll bil neste uke`

The app picks a group from the words (English and Norwegian). Tap another colour to change it. Tick the box when it is done. Tick again to undo.

Groups: Bills, To-do, Family, Health, Work, Business, Email, Home (car and house), Money, Other.

Work is for a job. Business is for his companies, such as Pope Holding. Email is for messages that need a reply.

A repeating item (day, week, month, year) jumps to the next date when you tick it.

## Run on this computer

```bash
node --test
npm start
```

`npm start` reads `secrets.env` if those values are not already set. Copy the names from `secrets.env.example`. Without `GITHUB_TOKEN`, items stay in `data/local-items.json` (gitignored) so you can try the app. That file is wiped if you delete it. The live site must have `GITHUB_TOKEN`.

## Secrets

Do not commit these. On Render they are environment variables. Locally they can live in `secrets.env`.

| Name | Where | What |
|---|---|---|
| `APP_PIN` | Render, and tell Tay | The code for the phone. 6 digits is a good length. |
| `API_TOKEN` | Render, and the assistant's notes | Long token for the API below. Not the PIN. |
| `SESSION_SECRET` | Render | Signs the login cookie. If you leave it empty, the app uses `API_TOKEN`. |
| `GITHUB_TOKEN` | Render only | Fine-grained GitHub token. Repo: `simonpope82/my-day-data` only. Permission: **Contents: Read and write**. |
| `DATA_REPO` | already in `render.yaml` | `simonpope82/my-day-data` |
| `DATA_BRANCH` | already in `render.yaml` | `main` |
| `DATA_PATH` | already in `render.yaml` | `items.json` |
| `COOKIE_SECURE` | already in `render.yaml` | `1` on Render |
| `TRUST_PROXY` | already in `render.yaml` | `1` on Render |
| `FAMILY_DATA_JSON` | Copy from the **family-pope** Render service | Tay's and Nina's calendars. Same value Family Hub already uses. |

`./deploy-render.sh` creates `APP_PIN`, `API_TOKEN` and `SESSION_SECRET` in `secrets.env` the first time. It does not print them.

GitHub token: [fine-grained tokens](https://github.com/settings/personal-access-tokens). It must be able to read and write `simonpope82/my-day-data`. This is the same pattern as **costa-rica-sync** (public code) and **costa-rica-data** (private list). A token that can only write `simonpope82/costa-rica-data` will not work here.

Render API key, only for the deploy script: [API keys](https://dashboard.render.com/u/settings#api-keys). An account key named **grok agent** was created on 19 Oct 2026. The secret value is only shown once, so if it was not saved, create a new key.

```bash
GITHUB_TOKEN=github_pat_… RENDER_API_KEY=rnd_… ./deploy-render.sh
```

This code repo can be public. Render only needs to clone it. The running app writes the private data repo with `GITHUB_TOKEN`, so Render's GitHub app does not need access to `my-day-data`.

The free service sleeps after a quiet spell. The first open can take up to a minute. The list is still safe. Data writes do not redeploy the site, because they land in `simonpope82/my-day-data`, not in this repo.

Mute GitHub email for `my-day-data` if ticks start sending you mail.

## Calendar

Family Hub already loads the Google calendars as secret ICS links inside `FAMILY_DATA_JSON` (the `calendars` list: name, url, colour). Copy that one env var from the **family-pope** service onto **my-day**. A Render secret file named `family-data.json` works too, same as Family Hub.

You can also set `FAMILY_DATA_JSON` to a short comma-separated list of `https://` or `webcal://` links if you do not want to copy the whole family file.

Today's events show on the Today screen with a calendar icon and a time. The next 7 days show under Coming up. Events are read-only. The list still loads if a calendar does not. Results are cached for 15 minutes.

`GET /api/today` adds `events` (and `calendarError` only when a calendar failed). Each event summary line starts with `Event:`.

## For the assistant

Base URL is the Render URL, for example `https://my-day-xxxx.onrender.com`. Set:

```bash
export MYDAY_URL="https://my-day-xxxx.onrender.com"
export MYDAY_API_TOKEN="the API_TOKEN from Render"
```

Send the token on every call. Do not send the PIN.

```bash
curl -fsS --retry 5 --retry-all-errors --retry-delay 5 --max-time 90 \
  "$MYDAY_URL/api/today" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN"
```

`summary` is a short list for the 07:30 mail. Calendar lines start with `Event:`. The same events are in `events`. `counts.label` is the "3 of 7 done" line. Dates are the Oslo calendar date (`Europe/Oslo`).

Add one line:

```bash
curl -fsS --retry 5 --retry-all-errors --retry-delay 5 --max-time 90 \
  "$MYDAY_URL/api/items" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"pay electricity bill friday 1200kr"}'
```

You can also send fields: `title`, `category` (`bills`, `todo`, `family`, `health`, `work`, `business`, `email`, `home`, `money`, `other`), `due` (`YYYY-MM-DD`), `amount`, `notes`, `repeat` (`daily`, `weekly`, `monthly`, `yearly`), `link` (http or https), `source` (for example `gmail` or `outlook`), `externalId` (dedupe key).

`business` is for his companies (Pope Holding and the like). Words such as `pope holding`, `holding`, `faktura til`, `regnskap`, `revisor`, `styre`, `aksje` and `mva` land there. `work` stays for job search.

`email` is a reply. Not-done email items show on Today under **Reply to**, with a count and an Open button when `link` is set. Send the same `externalId` again and the app returns the existing item with **200**, even if it is already done. It does not create a second one.

```bash
curl -fsS --retry 5 --retry-all-errors --retry-delay 5 --max-time 90 \
  "$MYDAY_URL/api/items" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Invoice from supplier","category":"email","source":"gmail","externalId":"gmail:18f2abc","link":"https://mail.google.com/mail/u/0/#inbox/18f2abc"}'
```

A company task:

```bash
curl -fsS --retry 5 --retry-all-errors --retry-delay 5 --max-time 90 \
  "$MYDAY_URL/api/items" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"faktura til kunde fra pope holding"}'
```

Mark done, or undo:

```bash
curl -fsS -X PATCH "$MYDAY_URL/api/items/ITEM_ID" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

curl -fsS -X PATCH "$MYDAY_URL/api/items/ITEM_ID" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"done":false,"undo":true}'
```

Open items in one group:

```bash
curl -fsS "$MYDAY_URL/api/items?done=false&category=bills" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN"
```

Delete:

```bash
curl -fsS -X DELETE "$MYDAY_URL/api/items/ITEM_ID" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN"
```

If Render is asleep, the curls above wake it. `--retry` covers the cold start. To read without waiting, use GitHub. This does not need the app to be awake:

```bash
gh api "/repos/simonpope82/my-day-data/contents/items.json?ref=main" --jq .content | base64 -d
```

Prefer `POST /api/items` for new items. The app parses the line, keeps a conflict retry, and will not clobber a tick that happens at the same time. The file shape is:

```json
{
  "v": 1,
  "items": [
    {
      "id": "uuid",
      "title": "Pay electricity bill",
      "category": "bills",
      "due": "2026-11-27",
      "amount": 1200,
      "currency": "NOK",
      "notes": "",
      "repeat": null,
      "monthDay": 27,
      "done": false,
      "doneAt": null,
      "lastDone": null,
      "history": [],
      "link": "",
      "source": "",
      "externalId": "",
      "createdAt": "2026-11-24T07:00:00.000Z",
      "updatedAt": "2026-11-24T07:00:00.000Z"
    }
  ]
}
```

Morning brief. Post one brief per Oslo date. The same date replaces the previous brief. The app keeps about 14 days in `brief.json` in the private data repo, next to `items.json`. Do not repeat tasks, bills, email replies, or calendar events here. Those already come from the app. Weather is shown first.

```bash
curl -fsS --retry 5 --retry-all-errors --retry-delay 5 --max-time 90 \
  "$MYDAY_URL/api/brief" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-11-24",
    "sections": [
      {
        "key": "weather",
        "title": "Weather",
        "emoji": "🌧️",
        "lines": [
          {"text": "6°. Rain this afternoon."},
          {"text": "Coat and boots."}
        ]
      },
      {
        "key": "birthdays",
        "title": "Birthdays",
        "emoji": "🎂",
        "lines": [
          {"text": "Nina, Friday."}
        ]
      },
      {
        "key": "parcels",
        "title": "Parcels",
        "emoji": "📦",
        "lines": [
          {"text": "Posten Ås. Code 4821."}
        ]
      },
      {
        "key": "jobs",
        "title": "Jobs",
        "emoji": "💼",
        "lines": [
          {"text": "Electrician, Ås", "link": "https://example.com/job/1"}
        ]
      }
    ]
  }'
```

`GET /api/brief?date=2026-11-24` returns `{ "brief": { "date", "sections" } }`. If that day has no brief, `brief` is `null`. `GET /api/today` includes the same `brief` for today. The Today screen shows it at the top. No brief means no card and no error.

Other routes: `GET /api/me`, `GET /api/items/ITEM_ID`, `POST /api/parse` with `{"text":"..."}`, `POST /api/login` with `{"pin":"..."}` (phone only), `POST /api/logout`, `GET /health` (no secret, no items).

## Pope Christmas (julegave)

Pope Christmas at `https://simonpope82.github.io/julegave/` uses this same service to sync the gift list. CORS is allowed only for that GitHub Pages origin. The phone app signs in with a PIN (the server stores a hash only). The assistant uses the same Bearer token as above, not the PIN.

```bash
curl -fsS --retry 5 --retry-all-errors --retry-delay 5 --max-time 90 \
  "$MYDAY_URL/api/julegave" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN"
```

`GET /api/julegave/status` is public and returns `{ "pinSet": true }` or `false`. `GET` and `PUT /api/julegave` need the token (or a PIN session). `PUT` replaces the sheet but never changes the PIN hash. Data lives in `julegave.json` in `simonpope82/my-day-data`, next to `items.json`. The file shape and PIN calls are in the Pope Christmas README, under **For the assistant**.

