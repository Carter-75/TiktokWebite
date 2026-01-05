# Product Pulse

Product Pulse is an AI-powered, TikTok-style shopping feed. Each scroll now reveals a head-to-head matchup between two products—both generated (or scraped) on demand, preloaded ahead of time, and tuned by your interactions.

## Feature Highlights
- **Dual compare lane**: Always keeps two equally weighted products on screen so you can like/dislike/save in context.
- **Infinite feed**: Maintains a background queue of pre-generated spotlights to instantly refill either slot.
- **Interaction learning**: Every like/dislike/report adjusts tag weights and future recommendations.
- **Account-bound saves**: Sign in to keep a locker of saved drops; guests still browse but nothing is persisted.
- **Guest + Google auth**: Runs in guest mode by default, seamlessly upgrades to Google OAuth when credentials are provided.
- **Local-first preferences**: History, tag weights, and cached products live in localStorage (mirrored to secure cookies as needed).
- **Monetization ready**: Sticky footer banner, inline ad slots, and desktop sidebar placements reserve space to keep CLS stable.
- **Live retailer enrichment (mandatory)**: Each AI card is validated against real US storefront links (via Google Shopping/SerpAPI) so every CTA lands on an actual product page; requests fail when no verifiable listing exists.
- **On-page diagnostics**: A built-in panel mirrors the queue/auth snapshot so you can copy/paste state whenever `npm run launch` surfaces an issue.
- **Secure backend surface**: Hardened API routes for AI generation, compliant scraping, and authentication with OWASP-aligned validation.
- **History vault + privacy controls**: Unlimited interaction/search history with export, retention tuning, and one-click data erasure.

## Stack Overview
- **Frontend**: Next.js 14 (App Router), React 18, Bulma tokens, CSS Modules + custom design system.
- **Backend**: Next.js route handlers (`/api/generate`, `/api/scrape`, `/auth/*`).
- **AI Layer**: Pluggable HTTP client (`AI_PROVIDER_URL`, `AI_PROVIDER_KEY`) with JSON schema enforcement and mandatory live retailer verification (no static fallback).
- **Testing**: Vitest unit tests covering feed logic (extendable for API + e2e scenarios).

## Quick Start

```bash
npm install
npm run dev
```

Visit http://localhost:3000 to start exploring the feed in guest mode.

Want a single "do everything" command? Run `npm run launch`. By default it wipes caches, reinstalls dependencies, installs Playwright browsers, lints, runs unit + e2e suites, builds, emits `npx next info`, and finally boots the dev server with automatic browser launch and verbose logging. Add `--diagnostics` to stop after the checks (used in CI), `--dev-only` to skip the heavy preflight, or `--purge-modules` (or env `RUN_ALL_PURGE_NODE_MODULES=true`) if you need to blow away `node_modules` before reinstalling.

## Backend Runtime

The API surface lives inside Next.js route handlers located under `src/app/api/*` and `src/app/auth/*`. Running `npm run dev` (or the full pipeline via `npm run launch`) boots the React UI *and* these backend handlers in a single Node process, so there is no separate server to manage.

### Required Environment Variables
Create a `.env.local` with the following values when you are ready to enable live auth/AI:

```dotenv
GOOGLE_CLIENT_ID=<[! required] OAuth client id>
GOOGLE_CLIENT_SECRET=<[! required] OAuth secret>
SESSION_SECRET=<random string for HMAC signing>
NEXT_PUBLIC_BASE_URL=http://localhost:3000
AI_PROVIDER_URL=<[! required for live AI] JSON-only endpoint>
AI_PROVIDER_KEY=<api key>
AI_PROVIDER_MODEL=gpt-4o-mini
NEXT_PUBLIC_ADMOB_CLIENT_ID=<ca-pub-xxxxxxxxxxxxxxxx>
# Optional: either set individual slot ids or fall back to the default slot below
NEXT_PUBLIC_ADMOB_FOOTER_SLOT=<admob-slot-id-footer>
NEXT_PUBLIC_ADMOB_INLINE_SLOT=<admob-slot-id-inline>
NEXT_PUBLIC_ADMOB_SIDEBAR_SLOT=<admob-slot-id-sidebar>
NEXT_PUBLIC_ADMOB_DEFAULT_SLOT=<shared-slot-id-if-using-one-placement>
SERPAPI_KEY=<[! required] SerpAPI key for Google Shopping lookups>
RETAIL_LOOKUP_LIMIT=2 # optional throttle; must be >= requested products

Copy [.env.template](.env.template) to `.env.local` (or `.env.development.local`) and fill in your local-only values. All `.env*` files are already gitignored, so `git add .` will skip them unless they were previously committed—run `git rm --cached <file>` if you ever need to untrack one.

### Managing secrets in Vercel
1. Open Vercel → Project → **Settings → Environment Variables**.
2. Add each key for every environment (`Production`, `Preview`, `Development`).
3. Pull them locally with `vercel env pull .env.local` (requires the Vercel CLI) instead of copying secrets by hand.

CLI alternative for scripting:

```bash
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_ID preview
vercel env add GOOGLE_CLIENT_ID development
# repeat for the remaining variables
```
```

> Until all required values (including `SERPAPI_KEY`) exist the app automatically remains in guest mode and API calls will fail rather than serving curated fallback data.

## Scripts
- `npm run dev` – Next.js dev server with Turbopack.
- `npm run launch` – Consolidated workflow. Default mode performs reset → install → lint → unit → e2e → build → `npx next info`, then starts the dev server and opens your browser. Pass `--diagnostics` to stop after the checks, `--dev-only` to skip straight to the dev server, or `--purge-modules` to force a clean dependency reinstall.
- `npm run build` – Production build.
- `npm run start` – Start production server.
- `npm run lint` – ESLint via `eslint-config-next`.
- `npm run test` – Vitest unit tests.
- `npm run test:e2e` – Playwright guest smoke with embedded Axe accessibility scan.
- `npm run diagnostics` – Alias for `npm run launch -- --diagnostics`.

## API Surface
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/generate` | POST | Validate preferences/history and return a product payload (AI-only; fails fast when live providers are unavailable). |
| `/api/scrape` | POST | Server-side scrape of allowlisted URLs with robots.txt checks. |
| `/auth/google` | GET | Initiate Google OAuth (returns 501 until creds exist). |
| `/auth/google/callback` | GET | Handle OAuth response, persist signed cookie session. |
| `/auth/me` | GET | Return current session (guest or Google). |
| `/auth/logout` | POST (pref) / GET | Clear cookies, emit `Clear-Site-Data`, and fall back to guest mode. |
| `/api/data/erase` | POST | Clear in-memory caches + rate limit buckets as part of the privacy reset flow. |

## Local Storage Schema
- `user_id`, `session_id` – Derived from secure cookies for hydration.
- `preferences` – `{ likedTags, dislikedTags, blacklistedItems, tagWeights }` snapshot.
- `history` – Full timeline of viewed/liked/disliked/reported IDs plus rich search entries and timestamps.
- `cache.generated_pages` – Serialized product payload cache (extendable).
- `preload_queue` – The three-product queue persisted across refreshes.

## Testing

```bash
npm run test
npm run test:e2e
```

The first command covers unit/integration suites (Vitest). The second spins up a temporary dev server, runs the Playwright guest smoke, and fails on any Axe WCAG A/AA violations (contrast violations skipped until final palette lock-in).

## Continuous Integration & Diagnostics
- `npm run diagnostics` (alias for `npm run launch -- --diagnostics`) wipes caches, installs dependencies, runs lint/unit/e2e/production build, optionally executes `vercel build --prod`, and finishes with `npx next info` so you get a single flood of debug data.
- The GitHub Actions workflow at `.github/workflows/ci.yml` runs that diagnostics mode on every push and pull request, uploading Playwright traces and `.next/trace` artifacts whenever something fails.

## Security & Compliance
- Strict CSP/COOP/COEP headers configured in `next.config.mjs`.
- OAuth state stored server-side in HttpOnly cookies with short TTL.
- `/api/scrape` blocks SSRF and respects `robots.txt` by default.
- All dynamic inputs validated with Zod schemas before hitting the AI or scraper layers.

## Deployment
- Set required environment variables (above) in your hosting platform.
- Use `npm run build && npm run start` or deploy via Vercel/GitHub Actions.

### How Vercel Handles the Backend
- The `/api/*` and `/auth/*` route handlers automatically compile into Vercel Serverless Functions (or Edge Functions when marked `runtime = 'edge'`). No extra backend service is required—deploying the Next.js app carries the API layer with it.
- The diagnostics mode (`npm run launch -- --diagnostics`) includes an optional `vercel build --prod` step (if the Vercel CLI is installed) so you can confirm serverless bundling locally before pushing.
- When running on other hosts, `npm run build && npm run start` exposes the same backend logic via Next.js’ Node runtime.

For a detailed implementation roadmap, see [TODO.md](TODO.md).
