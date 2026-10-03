# Free Render trial for mainland China access

Deploy the full Next.js app as a free **Web Service** in **Singapore**, using
Render's provided `onrender.com` address. A purchased domain is not required.
This is an access trial: location alone does not guarantee connectivity through
mainland networks. Keep Vercel available until the trial has passed.

## Deploy

1. Sign in to [Render](https://dashboard.render.com/) and connect this repository.
2. Select the `codex/free-render-trial` branch and create a Blueprint using
   `render.yaml`, or create a Web Service with these settings:

   | Setting | Value |
   | --- | --- |
   | Runtime | Node |
   | Region | Singapore |
   | Instance type | Free |
   | Node version | `22.23.1` |
   | Build command | `npm ci --include=dev && npm run build:app` |
   | Start command | `npm run start -- --hostname 0.0.0.0` |
   | Health check path | `/install` |

3. Set `DATABASE_URL` to the existing Vercel production value. Enter it directly
   in Render's environment settings; never put it in Git. The Blueprint generates
   a new `AUTH_SECRET` automatically. For a manually configured Web Service,
   generate one with `openssl rand -base64 32` and add it as `AUTH_SECRET`.
   Existing accounts and server-synced data stay in the same database. The new
   origin requires a fresh login. Browser-only data and the installed PWA do not
   transfer automatically between origins. Widget tokens are specific to each
   deployment's signing secret; generate new ones from the new address if used.
4. For the Hermes bot
   integration, also copy `R2_FIT_API_KEY` and `HERMES_OWNER_EMAIL` and update the
   bot's configured app URL when ready.
5. Deploy and use the actual URL assigned by Render. The requested service name
   does not guarantee `r2-fit-access-trial.onrender.com` is available.
   Keep Auto-Deploy off during this trial; trigger later deployments manually.

`build:app` validates the food pack, generates Prisma's client, and compiles
Next.js. It does **not** push database schema changes or seed food records. The
trial shares the existing database and should not change it during deployment.
The existing Vercel build command remains available.
Vercel automatic deployments are disabled only for `codex/free-render-trial`,
so pushing the trial branch does not invoke Vercel's database-mutating build.

Metadata uses `RENDER_EXTERNAL_URL` automatically on Render. Set `APP_URL` only
if you need to override the canonical address. Font files are served by Next.js
from the app's own origin; the browser does not request Google Fonts.

## Verify before switching

With the VPN off, test on both Hangzhou Wi-Fi and mobile data:

1. Open `/install` and `/login`, then sign in with an existing account.
2. Confirm existing records load, search for `telur`, and log then remove a test
   meal to confirm writes and sync work.
3. Check exercise demo images and sharing if used. Photo capture and uploads have been removed.
4. Install the new address as a PWA and confirm reopening and offline fallback.
5. Repeat after at least 15 minutes idle to check the cold start is acceptable.

The optional YouTube exercise links still require a network that reaches
YouTube. Exercise demo images come from jsDelivr. Historical photos may still
use Vercel Blob; new photo capture and uploads are removed.

## Free-plan limits

Render's free service sleeps after 15 minutes without inbound traffic; waking
it takes about a minute. A workspace receives 750 free instance hours per month.
Build and bandwidth quotas also apply. Check the dashboard's included quotas;
leave spend limits at zero where available and do not enable paid upgrades.

Do not create a free Render Postgres database for existing fitness data: it
expires after 30 days. Use the existing PostgreSQL service instead.

Sources: [Next.js deployment](https://render.com/docs/deploy-nextjs-app),
[regions](https://render.com/docs/regions),
[free limits](https://render.com/docs/free),
[default environment variables](https://render.com/docs/environment-variables).
