# Product Pulse: AI-Powered Shopping Feed

[![CI Status](https://img.shields.io/github/actions/workflow/status/your-username/your-repo/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/your-username/your-repo/actions/workflows/ci.yml)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Fyour-repo)

**Product Pulse** is a modern, AI-powered, TikTok-style shopping feed that surfaces **real Amazon products**. The application leverages the official Amazon Product Advertising API for product discovery and uses OpenAI to generate engaging, unique descriptions and comparisons.

It's designed as a seamless, infinite discovery experience where user interactions directly shape future recommendations.

---

## ✨ Core Features

-   **Real Amazon Products**: Every item shown is a real, purchasable product from Amazon, complete with a verified ASIN.
-   **AI-Generated Content**: Leverages OpenAI (gpt-4o-mini) to create compelling summaries, pros, cons, and unique selling points.
-   **Dual-Lane Comparison**: Always presents two products side-by-side, allowing for contextual likes, dislikes, and saves.
-   **Infinite Feed & Preloading**: A background queue constantly pre-fetches and generates content, ensuring the feed never runs out.
-   **Dynamic Personalization**: Every interaction (like, dislike, report) fine-tunes tag weights, tailoring the feed to your tastes in real-time.
-   **Guest & Authenticated Modes**: Works perfectly for guests with local-first preferences, with a seamless upgrade to Google OAuth for persistent, account-bound saved items.
-   **Robust Privacy Controls**: Features a complete history vault with export options, configurable data retention, and a one-click data erasure tool.
-   **Monetization-Ready**: Includes pre-configured, non-intrusive ad slots for footer, inline, and sidebar placements that gracefully hide when disabled.
-   **Hardened Security**: Built with a strong security posture, including a strict Content Security Policy (CSP), rate-limited API endpoints, and comprehensive input validation.

## 🚀 Tech Stack

-   **Framework**: Next.js 14 (App Router)
-   **Language**: TypeScript
-   **Styling**: Bulma Design Tokens, CSS Modules, and a custom design system
-   **Backend**: Next.js Route Handlers
-   **Product Discovery**: Amazon Product Advertising API (PA-API 5.0)
-   **AI Content Generation**: OpenAI API (gpt-4o-mini)
-   **Unit Testing**: Vitest
-   **E2E Testing**: Playwright with Axe for accessibility audits

---

## 🏁 Getting Started

### 1. Prerequisites

-   Node.js (v18.17 or later recommended)
-   `pnpm`, `npm`, or `yarn` for package management

### 2. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo
npm install
```

### 3. Environment Setup

The application requires API credentials to function. Copy the template file to create your local environment file:

```bash
cp .env.template .env.local
```

Now, open `.env.local` and fill in the required values.

#### **Amazon Product Advertising API Credentials (Required)**

This is the most critical step. The app **will not work** without valid Amazon PA-API credentials.

1.  **Join Amazon Associates**:
    -   Go to the [Amazon Associates Program](https://affiliate-program.amazon.com/) and sign up.
    -   You will need an approved account with some qualifying activity to get API access.
    -   Once approved, you will receive your **Associate Tag** (e.g., `yourtag-20`).

2.  **Request API Access**:
    -   Visit the [PA-API 5.0 Documentation](https://webservices.amazon.com/paapi5/documentation/) and sign in with your Associates account.
    -   Follow the instructions to request access to the Product Advertising API.

3.  **Generate Keys**:
    -   In your PA-API dashboard, generate your **Access Key** and **Secret Key**.
    -   **Important**: Save the Secret Key immediately and securely, as Amazon will not show it again.

4.  **Update `.env.local`**:
    -   Add your Amazon credentials to the `.env.local` file:
        ```dotenv
        AMAZON_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
        AMAZON_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
        AMAZON_ASSOCIATE_TAG=yourtag-20
        ```

#### **Other Environment Variables**

You will also need to provide credentials for Google OAuth and OpenAI, and generate a session secret.

```dotenv
# Google OAuth (for user accounts)
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
SESSION_SECRET=<run "npm run bootstrap:env" to generate>
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# OpenAI (for product descriptions)
AI_PROVIDER_URL=https://api.openai.com/v1/responses
AI_PROVIDER_KEY=<your-openai-api-key>
AI_PROVIDER_MODEL=gpt-4o-mini

# Amazon Product Advertising API (REQUIRED)
AMAZON_ACCESS_KEY=<your-amazon-access-key>
AMAZON_SECRET_KEY=<your-amazon-secret-key>
AMAZON_ASSOCIATE_TAG=<your-amazon-associate-tag>
AMAZON_PARTNER_TYPE=Associates
AMAZON_REGION=us-east-1

# Optional: AdMob monetization
NEXT_PUBLIC_ADMOB_CLIENT_ID=<ca-pub-xxxxxxxxxxxxxxxx>
NEXT_PUBLIC_ADMOB_INLINE_SLOT=<admob-slot-id-inline>
NEXT_PUBLIC_ADMOB_SIDEBAR_SLOT=<admob-slot-id-sidebar>

# Optional: Metrics dashboard
METRICS_READ_KEY=<run "npm run bootstrap:env" to generate>
```

To automatically generate a secure `SESSION_SECRET` and `METRICS_READ_KEY`, run:
```bash
npm run bootstrap:env
```
This will append the generated secrets to your `.env.local` file.

### 4. Run the Development Server

Once your environment variables are set, start the development server:

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the app in action.

---

## 🛠️ Available Scripts

-   `npm run dev`: Starts the Next.js development server with Turbopack.
-   `npm run launch`: A comprehensive script that resets caches, installs dependencies, lints, runs all tests, builds the project, and finally starts the dev server.
    -   `--diagnostics`: Stops after all checks (for CI).
    -   `--dev-only`: Skips all checks and starts the dev server immediately.
    -   `--purge-modules`: Deletes `node_modules` before reinstalling.
-   `npm run build`: Creates a production-ready build.
-   `npm run start`: Starts the production server.
-   `npm run lint`: Runs ESLint to check for code quality issues.
-   `npm run test`: Runs all unit tests with Vitest.
-   `npm run test:e2e`: Runs end-to-end smoke tests with Playwright.
-   `npm run diagnostics`: An alias for `npm run launch -- --diagnostics`.

## 🔐 Security & Compliance

-   **Strict Headers**: Implements a robust Content Security Policy (CSP), COOP/COEP, and other security headers in `next.config.mjs`.
-   **API Validation**: All public API endpoints use Zod for strict, schema-based input validation.
-   **Secure Sessions**: User sessions are managed with signed, `HttpOnly`, and `Secure` cookies to prevent tampering and XSS.
-   **Rate Limiting**: Key API endpoints are rate-limited to prevent abuse.
-   **SSRF Protection**: The `/api/scrape` endpoint (if used) is designed to block Server-Side Request Forgery attacks and respects `robots.txt`.

## 🧪 Testing

The project includes a full testing suite.

-   **Unit & Integration Tests**: Run with `npm run test`.
-   **End-to-End Tests**: Run with `npm run test:e2e`. This suite also performs an automated accessibility audit using Axe.

## ☁️ Deployment

This project is optimized for deployment on **Vercel**.

1.  Push your code to a GitHub repository.
2.  Import the repository into Vercel.
3.  Add all the environment variables from your `.env.local` file to the Vercel project settings (**Settings → Environment Variables**).
4.  Vercel will automatically build and deploy the application. The Next.js API routes will be deployed as Serverless Functions.

Alternatively, you can pull Vercel environment variables to your local machine:
```bash
vercel env pull .env.local
```
