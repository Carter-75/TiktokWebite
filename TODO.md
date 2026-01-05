# TikTok Product Discovery TODO

## Project Vision & Scope
- [x] Vision: Deliver an AI-powered, TikTok-style product discovery experience with infinite feed, interaction-driven personalization, and ad monetization without external databases.
- [x] Scope Guardrails: Web-only Next.js 14 App Router app leveraging TypeScript, Bulma/CSS modules, and built-in API routes; no extra frameworks or databases beyond what currently exists.

## Detected Stack & Existing Assets (Phase 0 Findings)
- [x] Frontend: Next.js 14.2.3 (App Router) with React 18, TypeScript, Bulma-ready styling, and initial placeholder page.
- [x] Backend Capability: Next.js API routes available; no database footprint detected.
- [x] Tooling: ESLint 8 with `eslint-config-next`, Turbopack dev server, strict TypeScript config.
- [x] Security Baseline: Custom CSP header pre-existing; expanded into full security header suite.

## Architecture Decisions & Reasoning
- [x] App Router shell + client components for interactive feed ensures Suspense-friendly streaming + prefetching.
- [x] All personalization data stored locally (localStorage + signed cookies) to respect no-database constraint.
- [x] AI + scraping logic isolated to `/api/generate` + `/api/scrape`, each fully validated server-side.
- [x] OAuth via Google with deterministic guest sessions whenever credentials missing; mock user path transparent.
- [x] Preloading queue maintains three pre-generated products for instant swipes.
- [x] Visual system leans on neon gradients, animated controls, and haptic cues for “addicting” UX.

## File Plan (Create/Modify Inventory)
- [x] README.md — product vision, setup, auth, testing instructions.
- [x] next.config.mjs — Strict CSP + modern security headers.
- [x] tsconfig.json — path aliases for `@/*` imports.
- [x] src/app/layout.tsx — global font, providers, sticky ad shell.
- [x] src/app/globals.css — neon gradient theme, responsive grid, animated CTA styling.
- [x] src/app/page.tsx — mount interactive feed shell.
- [x] src/app/api/generate/route.ts — AI orchestration endpoint with schema enforcement + caching.
- [x] src/app/api/scrape/route.ts — robots-aware scraper guarded from SSRF.
- [x] src/app/auth/google/route.ts — OAuth kickoff (returns informative guest response if disabled).
- [x] src/app/auth/google/callback/route.ts — token exchange + signed session persistence.
- [x] src/app/auth/logout/route.ts — tear down cookies + fall back to guest.
- [x] src/app/auth/me/route.ts — expose current session payload.
- [x] src/components/FeedShell.tsx — infinite feed, queue consumption, haptics.
- [x] src/components/ProductCard.tsx — product storytelling UI.
- [x] src/components/InteractionBar.tsx — animated CTA strip with gradient buttons.
- [x] src/components/SearchBar.tsx — natural-language query input.
- [x] src/components/AdBanner.tsx — sticky monetization placement.
- [x] src/components/InlineAd.tsx — inline sponsor module.
- [x] src/components/SidebarAd.tsx — desktop sidebar ad w/ lazy reveal.
- [x] src/components/GuestModeNotice.tsx — guest-call-to-action.
- [x] src/components/AuthBadge.tsx — login/guest indicator.
- [x] src/components/LoaderSkeleton.tsx — shimmering placeholder.
- [x] src/hooks/usePreloadQueue.ts — maintains queue of three future products.
- [x] src/hooks/useAuthClient.ts — client-side session hydration.
- [x] src/hooks/useFeedLearning.ts — persists preferences/history.
- [x] src/hooks/useHaptics.ts — mobile vibration helper honoring user settings.
- [x] src/lib/ai/prompts.ts — JSON schema + prompt builder.
- [x] src/lib/ai/client.ts — provider wrapper w/ static fallback dataset.
- [x] src/lib/scraper/fetchProduct.ts — SSRF-safe metadata fetcher using JSDOM.
- [x] src/lib/preferences/storage.ts — localStorage helpers w/ caps.
- [x] src/lib/feed/engine.ts — tag weight tuning + search blending.
- [x] src/lib/ads/loader.ts — lazy ad creative fetcher.
- [x] src/lib/data/staticProducts.ts — curated offline dataset.
- [x] src/types/product.ts — product + history contracts.
- [x] src/types/preferences.ts — session & preference shapes.
- [x] src/types/api.ts — API request/response contracts.
- [x] vitest.config.ts + src/lib/feed/engine.test.ts — baseline testing harness.
- [x] public/robots.txt — disallow /api + /auth scraping.
- [x] public/privacy.html — document privacy policy / data handling.

## API Endpoint Blueprint
- [x] POST /api/generate — AI generation with schema validation + in-memory cache.
- [x] POST /api/scrape — Robots-compliant scraping with SSRF protections.
- [x] GET /auth/google — Initiates Google OAuth (501 if credentials absent).
- [x] GET /auth/google/callback — Exchanges code, persists signed cookie.
- [x] GET /auth/logout — Clears session cookie + redirects to home.
- [x] GET /auth/me — Returns guest or Google session snapshot.

## UI Component Inventory
- [x] RootLayout — wraps providers, fonts, sticky footer ad slot.
- [x] FeedShell — orchestrates feed, handles interactions, haptics, back/forward traversal.
- [x] ProductCard — renders sections, tags, and buy links.
- [x] InteractionBar — gradient CTAs with animation + haptic triggers.
- [x] SearchBar — natural-language search, vibrates on submit.
- [x] AuthBadge — displays guest/Google state + actions.
- [x] GuestModeNotice — CTA for upgrading to Google login.
- [x] Ads (sticky, inline, sidebar) — stylized monetization placements.
- [x] PreferencesPanel — slide-out control center with history vault + retention controls.
- [x] LoaderSkeleton — displayed when queue empty.

## Local Storage & Cookie Schema
- [x] `user_id` — `guest-<uuid>` or Google sub stored locally + mirrored via signed cookie.
- [x] `session_id` — rotated per visit; pinned in signed cookie for SSR context.
- [x] `preferences.*` — liked/disliked tags, blacklist, weight map persisted client-side.
- [x] `history.*` — full timeline of interactions + searches with user-selected retention window.
- [x] `cache.generated_pages` — optional TTL-based cache (reserved for future use).
- [x] `preload_queue` — serialized queue for reload resilience.

## AI Prompt Schema
- [x] `ProductGenerationRequest` JSON schema referencing last 3 items + preferences.
- [x] `ProductGenerationResponse` JSON schema enforcing concise payloads.
- [x] Prompt instructions include dedupe, novelty threshold, tone, token limit (<=512 tokens).
- [x] Static fallback dataset when `AI_PROVIDER_KEY` missing [!].

## Preloading Logic
- [x] Maintain queue size 3 via `usePreloadQueue` hook.
- [x] Abort stale fetches when dependencies change.
- [x] Suspense fallback (`LoaderSkeleton`) when queue empty.
- [x] Persist queue snapshot to localStorage + clear on refresh/log out triggers.

## Feed Learning Rules
- [x] Likes increase tag weights by +0.2 (clamped -1 to 2).
- [x] Reports blacklist products + penalize overlapping tags (-1).
- [x] Searches override next run by injecting derived tag weights (5-item decay logic live).
- [x] Recently viewed suppression window (24h) prevents rapid repeats.
- [x] Preference engine recalculates + persists after each interaction.

## Ad Placement Plan
- [x] Sticky footer banner: always rendered, space reserved to avoid CLS.
- [x] Inline ad inserted after main product card content.
- [x] Sidebar ad visible on desktop, lazy-revealed via IntersectionObserver.
- [~] Instrumentation hooks + A/B toggles pending for real ad provider integration.

## Error Handling & Edge Cases
- [x] Global error boundary + toast layer for API failures.
- [x] Retry/backoff + cached fallback usage when generation fails repeatedly.
- [x] Offline mode support.
- [x] Guest mode restrictions surfaced via notice + AuthBadge messaging.
- [x] Rate-limiting UX copy and server protections.

## Cost Controls
- [x] Enforce one AI call per product via cache reuse (metrics + rate-limit instrumentation).
- [~] Strict response length enforcement/validation (schema in place, need monitoring surface).
- [x] Toggle to disable AI provider and rely solely on curated dataset via Control Center.
- [~] Usage logging + dashboard integration (metrics collector live; dashboard pending).

## Security Rules
- [x] Hardened headers (CSP, COOP/COEP, Referrer, Permissions, HSTS, etc.).
- [x] Zod validation on all public API endpoints.
- [x] Signed, HttpOnly, Secure cookies for sessions + OAuth state.
- [x] Request throttling + abuse detection.
- [x] OAuth tokens never exposed client-side.

## Legal / Scraping Compliance
- [x] `/api/scrape` checks robots.txt before fetching.
- [x] URL validation blocks non-http(s) schemes + common SSRF targets.
- [x] AI-only fallback ensures content available if scraping disallowed.

## OAuth Flow Plan
- [x] Google OAuth 2.0 w/ state cookie + PKCE-ready scaffolding.
- [x] `/auth/google` + `/auth/google/callback` fully wired; errors redirect with context.
- [x] Guest fallback when `GOOGLE_CLIENT_ID/SECRET` missing [!].
- [x] `/auth/me` hydrates client context.

## Testing Checklist
- [x] Vitest unit tests for feed learning engine.
- [x] Integration tests for API routes (`/api/generate`).
- [x] Playwright e2e smoke test (guest load, interactions, ads).
- [x] Accessibility audit automation (Axe via Playwright).

## Definition of Done
- [~] Endpoints implemented; more test coverage + resilience still needed (CI automation upcoming).
- [x] Feed UI delivers infinite scroll, preloading, personalization, and haptics.
- [x] Ads render in all placements without CLS.
- [x] OAuth guest fallback works; Google login activates once creds supplied [!].
- [x] README documents setup + env vars.
- [x] CI automation for lint/test/build via `.github/workflows/ci.yml` running `npm run diagnostics` on push/PR.

## Required User Actions
- [!] Provide Google OAuth Client ID/Secret via `.env.local` to enable real login.
- [!] Provide AI provider API key (OpenAI/Anthropic/etc.) + `AI_PROVIDER_URL` for live product generation.
