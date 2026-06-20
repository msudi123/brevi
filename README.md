# Brevi

Brevi is a Manifest V3 Chrome extension plus a Vercel backend. It detects paywalled article pages, finds free coverage of the same story, summarizes the free source with OpenAI, and enforces a 5-summary daily free tier through Supabase.

## Local Development

1. Copy `.env.example` to `.env`.
2. Add your local values:

```bash
OPENAI_API_KEY=sk-proj-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
FREE_DAILY_LIMIT=5
```

Supabase Auth in the popup uses the public anon key plus email/password sign-in.

3. Create the Supabase tables by running `supabase/schema.sql` in the Supabase SQL editor.
4. Start the backend:

```bash
npm start
```

5. Load this folder in Chrome at `chrome://extensions` using **Load unpacked**.
6. In the Brevi popup, use local backend URL:

```text
http://127.0.0.1:8787
```

7. Test the fake paywall page:

```text
http://127.0.0.1:8787/test-paywall
```

## Vercel Deployment

Deploy the repo to Vercel and add these environment variables:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
FREE_DAILY_LIMIT=5
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
PUBLIC_EXTENSION_ORIGIN=*
WHOP_API_KEY=
WHOP_CLIENT_ID=
WHOP_CLIENT_SECRET=
WHOP_WEBHOOK_SECRET=
WHOP_PRODUCT_ID=
WHOP_CHECKOUT_URL=https://whop.com
```

After deployment, set the extension backend URL to:

```text
https://brevi-psi.vercel.app
```

For production, replace `PUBLIC_EXTENSION_ORIGIN=*` with your Chrome extension origin once the extension ID is stable.

## Package Extension

Build the Chrome Web Store ZIP:

```bash
npm run package:extension
```

This creates:

```text
brevi-extension.zip
```

The ZIP includes only extension files and excludes `.env`, backend files, Supabase keys, OpenAI keys, and local data.

## Public Pages

The backend serves the public landing and policy pages used for launch and Chrome Web Store review:

```text
/
/privacy
/terms
/refunds
/support
/security
/robots.txt
/sitemap.xml
```

Support and policy contact email: `getbrevi@gmail.com`.

## Whop Later

Whop is intentionally deferred in v1. Reserved env vars are already listed so OAuth, entitlement checks, checkout, and verified webhooks can be added later without changing the extension/backend contract.
