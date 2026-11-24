#!/usr/bin/env bash
# Create or update the free Render service "my-day" and deploy it.
#
#   GITHUB_TOKEN=github_pat_… RENDER_API_KEY=rnd_… ./deploy-render.sh
#   ./deploy-render.sh --dry-run
#
# Writes APP_PIN, API_TOKEN and SESSION_SECRET into secrets.env (mode 600) if they
# are missing. That file is gitignored. GITHUB_TOKEN is sent to Render but not saved here.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SECRETS="$DIR/secrets.env"
API="https://api.render.com/v1"
NAME="${SERVICE_NAME:-my-day}"
REPO_URL="${REPO_URL:-https://github.com/simonpope82/my-day}"
BRANCH="${BRANCH:-main}"
REGION="${REGION:-frankfurt}"
PLAN="${PLAN:-free}"
DRY=0
[[ "${1:-}" == "--dry-run" || "${1:-}" == "-n" ]] && DRY=1

say() { printf '%s\n' "$*" >&2; }
die() { say "ERROR: $*"; exit 1; }
need() { command -v "$1" >/dev/null || die "needs $1"; }
need curl
need node

umask 077
touch "$SECRETS"
chmod 600 "$SECRETS"

SECRETS_FILE="$SECRETS" node <<'JS'
const fs = require('fs');
const crypto = require('crypto');
const file = process.env.SECRETS_FILE;
const text = fs.readFileSync(file, 'utf8');
const have = {};
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) have[m[1]] = m[2];
}
function pin() {
  for (let i = 0; i < 20; i++) {
    const n = String(crypto.randomInt(100000, 1000000));
    if (!/^(\d)\1+$/.test(n) && n !== '123456' && n !== '654321') return n;
  }
  return String(crypto.randomInt(100000, 1000000));
}
const add = [];
if (!have.APP_PIN || have.APP_PIN.length < 4) add.push(`APP_PIN=${pin()}`);
if (!have.API_TOKEN || have.API_TOKEN.length < 16) add.push(`API_TOKEN=${crypto.randomBytes(24).toString('hex')}`);
if (!have.SESSION_SECRET || have.SESSION_SECRET.length < 16) add.push(`SESSION_SECRET=${crypto.randomBytes(24).toString('hex')}`);
if (add.length) fs.appendFileSync(file, (text.endsWith('\n') || !text ? '' : '\n') + add.join('\n') + '\n');
JS

read_secret() { node -e 'const fs=require("fs");const t=fs.readFileSync(process.argv[1],"utf8");const k=process.argv[2];const m=t.match(new RegExp("^"+k+"=(.*)$","m"));if(!m)process.exit(1);process.stdout.write(m[1].trim())' "$SECRETS" "$1"; }

APP_PIN="$(read_secret APP_PIN)"
API_TOKEN="$(read_secret API_TOKEN)"
SESSION_SECRET="$(read_secret SESSION_SECRET)"
[[ ${#APP_PIN} -ge 4 ]] || die "APP_PIN missing in secrets.env"
[[ ${#API_TOKEN} -ge 16 ]] || die "API_TOKEN missing in secrets.env"

ENV_JSON="$(APP_PIN="$APP_PIN" API_TOKEN="$API_TOKEN" SESSION_SECRET="$SESSION_SECRET" GITHUB_TOKEN="${GITHUB_TOKEN:-}" node -e '
const keys = ["NODE_VERSION","APP_PIN","API_TOKEN","SESSION_SECRET","GITHUB_TOKEN","DATA_REPO","DATA_BRANCH","DATA_PATH","COOKIE_SECURE","TRUST_PROXY"];
const values = {
  NODE_VERSION: "22",
  APP_PIN: process.env.APP_PIN,
  API_TOKEN: process.env.API_TOKEN,
  SESSION_SECRET: process.env.SESSION_SECRET,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  DATA_REPO: "simonpope82/my-day",
  DATA_BRANCH: "data",
  DATA_PATH: "items.json",
  COOKIE_SECURE: "1",
  TRUST_PROXY: "1"
};
process.stdout.write(JSON.stringify(keys.map((key) => ({ key, value: values[key] }))));
')"

say "Secrets for Tay and the assistant are in secrets.env (not in git)."
say "Service: $NAME   repo: $REPO_URL ($BRANCH)   plan: $PLAN   region: $REGION"

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  if [[ $DRY -eq 1 ]]; then
    say "Dry run: no RENDER_API_KEY, so Render was not called."
    say "When ready: GITHUB_TOKEN=… RENDER_API_KEY=rnd_… ./deploy-render.sh"
    exit 0
  fi
  die "RENDER_API_KEY is not set. Create one at https://dashboard.render.com/u/settings#api-keys (a key named grok agent already exists on this account)."
fi
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  die "GITHUB_TOKEN is not set. Use a fine-grained PAT for simonpope82/my-day with Contents: Read and write. The same token used by costa-rica-sync works if it can write this repo."
fi

api() {
  local method="$1" path="$2" data="${3:-}" out code
  out="$(mktemp)"
  code="$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$API$path" \
    -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" \
    ${data:+-H "Content-Type: application/json" --data "$data"})" || { rm -f "$out"; die "network error on $method $path"; }
  if [[ "$code" -ge 400 ]]; then
    say "Render $method $path failed (HTTP $code)"
    node -e 'let s=require("fs").readFileSync(process.argv[1],"utf8"); s=s.replace(/rnd_[A-Za-z0-9]+/g,"rnd_…").replace(/github_pat_[A-Za-z0-9_]+/g,"github_pat_…").replace(/ghp_[A-Za-z0-9]+/g,"ghp_…"); process.stdout.write(s);' "$out" >&2 || true
    echo >&2
    rm -f "$out"
    exit 1
  fi
  cat "$out"
  rm -f "$out"
}

OWNERS="$(api GET "/owners?limit=20")"
OWNER_ID="${RENDER_OWNER_ID:-$(node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); if(!j.length) process.exit(1); process.stdout.write(j[0].owner.id)' <<<"$OWNERS")}"
say "Workspace: $OWNER_ID"

SVC_JSON="$(api GET "/services?name=$NAME&ownerId=$OWNER_ID&limit=20")"
SID="$(node -e '
const name = process.argv[1];
const rows = JSON.parse(require("fs").readFileSync(0, "utf8"));
const hit = rows.map((r) => r.service || r).find((s) => s && s.name === name);
if (hit) process.stdout.write(hit.id);
' "$NAME" <<<"$SVC_JSON")"

BODY="$(node -e '
const env = JSON.parse(process.argv[1]);
const body = {
  type: "web_service",
  name: process.argv[2],
  ownerId: process.argv[3],
  repo: process.argv[4],
  branch: process.argv[5],
  autoDeployTrigger: "commit",
  envVars: env,
  serviceDetails: {
    runtime: "node",
    plan: process.argv[6],
    region: process.argv[7],
    healthCheckPath: "/health",
    envSpecificDetails: {
      buildCommand: "npm install --omit=dev",
      startCommand: "npm start"
    }
  }
};
process.stdout.write(JSON.stringify(body));
' "$ENV_JSON" "$NAME" "$OWNER_ID" "$REPO_URL" "$BRANCH" "$PLAN" "$REGION")"

if [[ $DRY -eq 1 ]]; then
  say "Dry run only. Would ${SID:+update $SID}${SID:-create the service} and deploy."
  exit 0
fi

if [[ -n "$SID" ]]; then
  say "Updating $NAME ($SID)"
  api PUT "/services/$SID/env-vars" "$ENV_JSON" >/dev/null
  DEPLOY_ID="$(api POST "/services/$SID/deploys" '{"clearCache":"do_not_clear"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).id||""))')"
else
  say "Creating $NAME"
  RES="$(api POST "/services" "$BODY")"
  SID="$(node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); process.stdout.write((j.service&&j.service.id)||"")})' <<<"$RES")"
  DEPLOY_ID="$(node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); process.stdout.write(j.deployId||"")})' <<<"$RES")"
  if [[ -z "$DEPLOY_ID" ]]; then
    sleep 3
    DEPLOY_ID="$(api GET "/services/$SID/deploys?limit=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); process.stdout.write((j[0]&&j[0].deploy&&j[0].deploy.id)||"")})')"
  fi
fi

say "Deploy $DEPLOY_ID started"
for i in $(seq 1 90); do
  ST="$(api GET "/services/$SID/deploys/$DEPLOY_ID" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).status||""))')"
  case "$ST" in
    live) say "Deploy is live"; break ;;
    build_failed|update_failed|pre_deploy_failed|canceled|deactivated)
      die "Deploy status: $ST. See https://dashboard.render.com/web/$SID" ;;
    *) say "Status: $ST"; sleep 10 ;;
  esac
done
[[ "${ST:-}" == "live" ]] || die "Timed out. See https://dashboard.render.com/web/$SID"

URL="$(api GET "/services/$SID" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); process.stdout.write((j.serviceDetails&&j.serviceDetails.url)||"")})')"
say "Live URL: ${URL:-see the Render dashboard}"
if [[ -n "$URL" ]]; then
  curl -fsS --retry 5 --retry-delay 3 --max-time 90 "$URL/health" >/dev/null && say "Health check OK" || say "Health check did not answer yet. The free plan can take a minute to wake."
fi
printf '%s\n' "${URL:-}"
