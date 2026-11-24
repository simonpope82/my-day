# My Day

Tay's daily list. Big type, big buttons, short words. Works on an iPhone home screen and on a computer.

The list is **not** stored on the Render disk. Render's free plan wipes that disk on every restart. Items are saved in this private repo, on the branch `data`, in `items.json`. A restart or a new deploy does not delete them.

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

Groups: Bills, To-do, Family, Health, Work, Home (car and house), Money, Other.

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
| `GITHUB_TOKEN` | Render only | Fine-grained GitHub token. Repo: `simonpope82/my-day` only. Permission: **Contents: Read and write**. |
| `DATA_REPO` | already in `render.yaml` | `simonpope82/my-day` |
| `DATA_BRANCH` | already in `render.yaml` | `data` |
| `DATA_PATH` | already in `render.yaml` | `items.json` |
| `COOKIE_SECURE` | already in `render.yaml` | `1` on Render |
| `TRUST_PROXY` | already in `render.yaml` | `1` on Render |

`./deploy-render.sh` creates `APP_PIN`, `API_TOKEN` and `SESSION_SECRET` in `secrets.env` the first time. It does not print them.

GitHub token: [fine-grained tokens](https://github.com/settings/personal-access-tokens). If the token from **costa-rica-sync** can write this repo, you can reuse it. A token that can only write `simonpope82/costa-rica-data` will not work here. You can point this app at that repo instead by setting `DATA_REPO=simonpope82/costa-rica-data`, `DATA_BRANCH=main`, `DATA_PATH=my-day.json`. A separate file will not touch the trip `data.json`.

Render API key, only for the deploy script: [API keys](https://dashboard.render.com/u/settings#api-keys). An account key named **grok agent** was created on 19 Oct 2026. The secret value is only shown once, so if it was not saved, create a new key.

```bash
GITHUB_TOKEN=github_pat_… RENDER_API_KEY=rnd_… ./deploy-render.sh
```

The GitHub app on Render must be allowed to see the private repo `simonpope82/my-day`. In the Render dashboard: Account Settings → GitHub, and include this repo.

The free service sleeps after a quiet spell. The first open can take up to a minute. The list is still safe. Data writes do not redeploy the site, because they land on the `data` branch, not `main`.

Mute GitHub email for the `data` branch if ticks start sending you mail.

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

`summary` is a short list for the 07:30 mail. `counts.label` is the "3 of 7 done" line. Dates are the Oslo calendar date (`Europe/Oslo`).

Add one line:

```bash
curl -fsS --retry 5 --retry-all-errors --retry-delay 5 --max-time 90 \
  "$MYDAY_URL/api/items" \
  -H "Authorization: Bearer $MYDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"pay electricity bill friday 1200kr"}'
```

You can also send fields: `title`, `category` (`bills`, `todo`, `family`, `health`, `work`, `home`, `money`, `other`), `due` (`YYYY-MM-DD`), `amount`, `notes`, `repeat` (`daily`, `weekly`, `monthly`, `yearly`).

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
gh api "/repos/simonpope82/my-day/contents/items.json?ref=data" --jq .content | base64 -d
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
      "createdAt": "2026-11-24T07:00:00.000Z",
      "updatedAt": "2026-11-24T07:00:00.000Z"
    }
  ]
}
```

Other routes: `GET /api/me`, `GET /api/items/ITEM_ID`, `POST /api/parse` with `{"text":"..."}`, `POST /api/login` with `{"pin":"..."}` (phone only), `POST /api/logout`, `GET /health` (no secret, no items).
