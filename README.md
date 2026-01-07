# Product Pulse

Product Pulse is an AI-powered, TikTok-style shopping feed that shows you REAL Amazon products. The app searches Amazon's catalog using the official Product Advertising API, then uses AI to create engaging descriptions and comparisons.

## How It Works
1. **Search Real Products**: Uses Amazon Product Advertising API to find actual products you can buy
2. **AI Describes Them**: OpenAI generates compelling descriptions, pros/cons, and summaries
3. **You Decide**: Swipe through products, like what you love, dislike what you don't
4. **Smart Learning**: Your interactions adjust recommendations to match your preferences

## Feature Highlights
- **Real Amazon Products Only**: Every product is real, searchable on Amazon with verified ASINs
- **Dual compare lane**: Always keeps two equally weighted products on screen so you can like/dislike/save in context
- **Infinite feed**: Maintains a background queue of pre-generated spotlights to instantly refill either slot
- **Interaction learning**: Every like/dislike/report adjusts tag weights and future recommendations
- **Account-bound saves**: Sign in to keep a locker of saved drops; guests still browse but nothing is persisted
- **Guest + Google auth**: Runs in guest mode by default, seamlessly upgrades to Google OAuth when credentials are provided
- **Local-first preferences**: History, tag weights, and cached products live in localStorage
- **Monetization ready**: Footer, inline, and sidebar ad placements with no spacing when ads are disabled
- **Centralized error logging**: All errors accessible via F12 console - no special account needed
- **On-page diagnostics**: A built-in panel mirrors the queue/auth snapshot so you can copy/paste state
- **Secure backend**: Hardened API routes for AI generation and authentication with OWASP-aligned validation
- **History vault + privacy controls**: Unlimited interaction/search history with export, retention tuning, and one-click data erasure

## Stack Overview
- **Frontend**: Next.js 14 (App Router), React 18, Bulma tokens, CSS Modules + custom design system
- **Backend**: Next.js route handlers (`/api/generate`, `/auth/*`)
- **Product Discovery**: Amazon Product Advertising API (official) for real product search
- **AI Layer**: OpenAI (gpt-4o-mini) for product descriptions and recommendations
- **Testing**: Vitest unit tests + Playwright E2E tests

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
Create a `.env.local` with the following values:

```dotenv
# Google OAuth (for user accounts)
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
SESSION_SECRET=<random-string-for-hmac>
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# OpenAI (for product descriptions)
AI_PROVIDER_URL=https://api.openai.com/v1/responses
AI_PROVIDER_KEY=<your-openai-api-key>
AI_PROVIDER_MODEL=gpt-4o-mini

# Amazon Product Advertising API (REQUIRED - for real product search)
AMAZON_ACCESS_KEY=<your-amazon-access-key>
AMAZON_SECRET_KEY=<your-amazon-secret-key>
AMAZON_ASSOCIATE_TAG=<your-amazon-associate-tag>
AMAZON_PARTNER_TYPE=Associates
AMAZON_REGION=us-east-1

# Optional: AdMob monetization (inline and sidebar placements)
NEXT_PUBLIC_ADMOB_CLIENT_ID=<ca-pub-xxxxxxxxxxxxxxxx>
NEXT_PUBLIC_ADMOB_INLINE_SLOT=<admob-slot-id-inline>
NEXT_PUBLIC_ADMOB_SIDEBAR_SLOT=<admob-slot-id-sidebar>

# Optional: Caching and limits
RETAIL_LOOKUP_LIMIT=3
RETAIL_LOOKUP_CACHE_TTL_MS=900000
RETAIL_LOOKUP_CACHE_SIZE=256

# Optional: Metrics dashboard
METRICS_READ_KEY=<metrics-dashboard-read-token>
```

### Getting Amazon Product Advertising API Credentials

**This is REQUIRED for the app to work.** The app uses the official Amazon Product Advertising API to search for real products.

#### Step 1: Join Amazon Associates Program
1. Go to https://affiliate-program.amazon.com/
2. Sign up for an Amazon Associates account
3. You need to create content (blog, website, social media) and get approved
4. Once approved, you'll get your **Associate Tag** (example: `yoursite-20`)

#### Step 2: Request Product Advertising API Access
1. Go to https://webservices.amazon.com/paapi5/documentation/
2. Sign in with your Amazon Associates account
3. Request access to Product Advertising API
4. **Note**: You need an approved Associates account with qualifying activity before API access is granted

#### Step 3: Generate Access Keys
1. Once approved, go to your Product Advertising API dashboard
2. Generate your **Access Key** and **Secret Key**
3. Save these securely - you can't view the Secret Key again

#### Step 4: Add to .env.local
```dotenv
AMAZON_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
AMAZON_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AMAZON_ASSOCIATE_TAG=yoursite-20
```

**Important**: Without these credentials, the app cannot search for products and will not work.

Copy [.env.template](.env.template) to `.env.local` and fill in your values. All `.env*` files are gitignored.

Need help generating secrets? Run `npm run bootstrap:env` to auto-generate `SESSION_SECRET` and `METRICS_READ_KEY` values.

### Managing secrets in Vercel
1. Open Vercel → Project → **Settings → Environment Variables**
2. Add each key for every environment (`Production`, `Preview`, `Development`)
3. Pull them locally with `vercel env pull .env.local`

> **Important**: The app requires Amazon Product Advertising API credentials to function. Without them, product search will fail and the app won't work.

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
| `/api/generate` | POST | Search Amazon for real products and generate AI descriptions |
| `/auth/google` | GET | Initiate Google OAuth |
| `/auth/google/callback` | GET | Handle OAuth response, persist signed cookie session |
| `/auth/me` | GET | Return current session (guest or Google) |
| `/auth/logout` | POST / GET | Clear cookies and fall back to guest mode |
| `/api/data/erase` | POST | Clear in-memory caches + rate limit buckets for privacy |

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
