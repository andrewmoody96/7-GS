# Deploying 7-Game Series

There are two ways to put the app online. They do different jobs:

| | GitHub Pages | Heroku |
|---|---|---|
| What runs | The PWA only, with its built-in demo backend | The PWA **and** the API + Postgres |
| Accounts / sign-in | None: one demo team per browser | Email magic links |
| Data | Stays in that browser's `localStorage` | Postgres, on every device you sign in from |
| Games go final at midnight | Simulated in the browser (demo controls) | The server's finalizer, every 15 minutes |
| Cost | Free | Eco or Basic dyno + Postgres Essential-0 (about $10–$12 a month) |
| Use it for | Showing friends, design feedback | Actually playing the season |

GitHub Pages only serves static files, so it can't run the API, the database or the
nightly finalizer. That's why the full app goes on Heroku.

**Both deploy from `main`.** Day-to-day work happens on the dev branch,
`claude/7-game-series-brainstorm-8ydzpv`, where CI checks every push. To release, open a
pull request from the dev branch into `main` and merge it when CI passes.

---

## 1. GitHub Pages (the demo)

Everything is in `.github/workflows/pages.yml`. The demo is served from
`https://andrewmoody96.github.io/7-GS/`.

**One-time setup (on github.com):**

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Repo **Settings → Environments → github-pages**: deployments must be allowed from
   `main`. The default rule allows only the default branch, which is `main`, so this
   usually needs no change.

**Deploy:** merge into `main`, or start **Actions → Deploy demo to GitHub Pages → Run
workflow** with `main` selected. The URL appears on the run's summary page.

**How it works:** the build sets `VITE_BASE=/7-GS/`. The router, the PWA manifest and
the service worker all live under that path. `404.html` is a copy of the app shell, so
deep links such as `/7-GS/season` still load the app.

**Try it locally:**

```sh
VITE_BASE=/7-GS/ pnpm --filter @7gs/web build
```

The output lands in `apps/web/dist`.

---

## 2. Heroku (the real app)

One web dyno serves the built PWA and the `/v1` API from the same origin, so the
session cookie stays first-party and no CORS is needed. The repo already has
everything Heroku looks for:

| File | What it does |
|---|---|
| `package.json` | `engines.node: 22.x` and `packageManager: pnpm@…`, which Heroku uses to pick Node and pnpm. |
| `package.json` → `build` | Builds the PWA in API mode (`apps/web/dist`). |
| `package.json` → `heroku-cleanup` | Keeps only production dependencies. Needed because `pnpm prune` doesn't work in workspaces. |
| `Procfile` → `release` | Runs database migrations before each new release goes live. |
| `Procfile` → `web` | Starts the server on `$PORT`. It serves the PWA, the API, and `/healthz`, and runs the finalizer. |
| `app.json` | Describes the app for Heroku: the Postgres add-on and the config vars. |

### First deploy (Heroku CLI)

```sh
heroku create my-7gs                                  # pick any free name
heroku addons:create heroku-postgresql:essential-0    # sets DATABASE_URL
heroku config:set NODE_ENV=production APP_URL=https://my-7gs-xxxx.herokuapp.com
```

For `APP_URL`, use the exact URL that `heroku create` printed (or your custom domain),
with no trailing path.

Then pick **one** way to sign in:

```sh
# A) Real sign-in emails (recommended). Resend: https://resend.com, free tier is plenty.
heroku config:set RESEND_API_KEY=re_xxx EMAIL_FROM="7-Game Series <play@yourdomain.com>"
#    …or Postmark (heroku addons:create postmark sets POSTMARK_API_TOKEN for you)
heroku config:set POSTMARK_API_TOKEN=xxx EMAIL_FROM="7-Game Series <play@yourdomain.com>"

# B) A private trial with no email: the sign-in screen shows "Sign in now".
#    Anyone who finds the URL can sign in as any address, so switch to A before sharing.
heroku config:set ALLOW_DEV_LOGIN=true
```

`EMAIL_FROM` must use a domain (or sender address) you've verified with the provider.

### Email without a domain: Gmail

No domain of your own? Send from a Gmail account instead. Sign-in links and email
reminders then come from that Gmail address (Gmail allows about 500 emails a day, plenty
for a small group).

1. The Gmail account needs **2-Step Verification** on: myaccount.google.com → Security.
2. Create an **app password**: myaccount.google.com/apppasswords → name it "7-Game Series"
   → **Create**. Google shows 16 letters in four groups. Copy them (the spaces don't matter).
3. In the Heroku dashboard → your app → **Settings → Reveal Config Vars**, add:

   | KEY | VALUE |
   |---|---|
   | `GMAIL_USER` | the Gmail address, e.g. `yourname@gmail.com` |
   | `GMAIL_APP_PASSWORD` | the 16 letters |
   | `EMAIL_FROM` | optional: the sender name people see, e.g. `7-Game Series` |

4. Once a test sign-in email arrives, delete `ALLOW_DEV_LOGIN` so sign-in needs the email link.

The app password only lets the app send mail; it can't sign in to the Google account. To
stop it, delete it on the same Google page.

Decide who can get in. Without an invite list, anyone with the URL can create an account:

```sh
# Just these people (addresses), and/or everyone at a domain (@domain):
heroku config:set ALLOWED_EMAILS="you@example.com, friend@example.com, @yourfamily.com"
```

Anyone else who tries sees "This 7-Game Series is invite-only…" and no email is sent.
To add someone, set the list again with their address (the dyno restarts in a few
seconds). If you take someone off, they're signed out the next time the app talks to
the server. Their data stays; put them back and it's all still there.

Deploy `main`:

```sh
git checkout main && git pull
git push heroku main
heroku open
```

**Recommended: automatic deploys from `main`.** In the Heroku dashboard, go to the
**Deploy** tab:

1. **Deployment method → GitHub**, and connect `andrewmoody96/7-GS`.
2. **Automatic deploys → branch `main`**. Tick **Wait for CI to pass before deploy**.
3. Click **Enable Automatic Deploys**.

After that, every merge into `main` deploys itself once CI is green. Pushes to the dev
branch never touch production.

### What production enforces

The server **refuses to start** (and `heroku logs` says exactly why) when
`NODE_ENV=production` and any of these is true:

- `DATABASE_URL` is missing. Without it, data would sit on the dyno's disk, which Heroku
  wipes at least daily.
- There is no email provider and `ALLOW_DEV_LOGIN` is not `true`.
- An email provider is set but `EMAIL_FROM` or `APP_URL` is missing.
- The web build is missing.

With `NODE_ENV=production` set, the server also does the following automatically:

- Marks the session cookie `Secure`.
- Redirects `http://` to `https://` and adds HSTS.
- Never returns `devToken` (unless `ALLOW_DEV_LOGIN=true`).
- Limits magic-link requests to 5 per address and 20 per client every 15 minutes.
- Connects to Postgres over TLS.
- Skips the response-validation pass.

### Config vars

| Var | Default | Notes |
|---|---|---|
| `NODE_ENV` | — | Set to `production`. |
| `DATABASE_URL` | set by the add-on | TLS is on in production; set `DATABASE_SSL=false` to turn it off. |
| `APP_URL` | — | Origin used in email links. Required with email. |
| `GMAIL_USER` + `GMAIL_APP_PASSWORD` | — | Email from a Gmail account, no domain needed (see above). |
| `RESEND_API_KEY` / `POSTMARK_API_TOKEN` | — | Use one (or Gmail). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | generated | Reminder (push) keys. Leave unset: the server makes a pair on first start and keeps it in the database. |
| `EMAIL_FROM` | — | Required with either provider. |
| `ALLOW_DEV_LOGIN` | `false` in prod | `true` shows the "Sign in now" shortcut. |
| `ALLOWED_EMAILS` | unset (open) | Invite list: comma-separated addresses and/or `@domains`. |
| `FINALIZER_INTERVAL_MS` | `900000` | How often games are settled. |
| `FORCE_HTTPS`, `COOKIE_SECURE`, `LIMIT_MAGIC_LINKS` | `true` in prod | Escape hatches; leave them alone on Heroku. |
| `LOG_REQUESTS` | `true` | One log line per request. |

### Reminders

Reminders arrive as notifications (and by email for anyone who turns that on, once email
is set up). Each person turns them on per device in **Team → Settings → Reminders**:

- **iPhone:** only in the Home Screen app (Safari → Share → Add to Home Screen first).
- **Desktop:** Chrome, Edge, Firefox or Safari, in a normal tab.

Nothing to configure on Heroku: the server creates its push keys on first start. They
live in the database, so a new database means everyone turns reminders on again.

### Deleting accounts

Players delete their own account from **Season → Clubhouse → Delete account**. They
type their email to confirm. That removes every season, series, game, task and
allowance, and signs them out on every device. Nothing is kept. They can sign up again
later with the same email, but they start from scratch.

### Dyno notes

- **Eco dynos sleep** after 30 minutes without traffic. That's fine: when the dyno wakes,
  the finalizer catches up on every day that settled while it slept. Each run is
  idempotent and keyed by user and date. Results only appear once someone opens the
  app; Basic dynos stay awake.
- **One web dyno.** The magic-link limiter keeps its counts in memory. If you scale
  past one dyno, each dyno keeps its own counts, so the limits loosen; nothing breaks.
- **Health check:** `GET /healthz` returns `{"ok":true}` when the database answers.

### Rehearse a production build locally

```sh
pnpm install && pnpm run build
NODE_ENV=production ALLOW_DEV_LOGIN=true PGLITE_DATA_DIR=/tmp/7gs-prod PORT=5055 pnpm start
```

Then open http://localhost:5055. Locally, PGlite stands in for `DATABASE_URL`.
