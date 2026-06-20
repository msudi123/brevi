const CONTACT_EMAIL = "getbrevi@gmail.com";
const LAST_UPDATED = "June 20, 2026";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refunds", label: "Refunds" },
  { href: "/support", label: "Support" }
];

export function handleSiteRequest(request, response, config) {
  const url = new URL(request.url || "/", `https://${request.headers.host || "getbrevireader.com"}`);
  const path = normalizePath(url.pathname);

  if (path === "/robots.txt") {
    sendText(response, 200, renderRobots(config));
    return true;
  }

  if (path === "/sitemap.xml") {
    sendXml(response, 200, renderSitemap(config));
    return true;
  }

  const page = pages(config)[path];
  if (!page) return false;

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=300"
  });
  response.end(renderPage({ ...page, path, config }));
  return true;
}

function pages(config) {
  const appUrl = siteUrl(config);
  return {
    "/": {
      title: "Brevi - Open-web story briefs in seconds",
      description: "Brevi helps Chrome readers understand locked or paywalled stories by finding separate open-web coverage and building a concise brief.",
      body: renderHome(appUrl)
    },
    "/privacy": {
      title: "Privacy Policy - Brevi",
      description: "Learn what Brevi collects, how article metadata is used, and how credit purchases are connected to verified accounts.",
      body: renderPrivacy()
    },
    "/terms": {
      title: "Terms of Service - Brevi",
      description: "Read the terms that apply when using the Brevi Chrome extension and credit-based summary service.",
      body: renderTerms()
    },
    "/refunds": {
      title: "Refund Policy - Brevi",
      description: "Review Brevi's credit purchase, refund, and support policy.",
      body: renderRefunds()
    },
    "/support": {
      title: "Support - Brevi",
      description: "Contact Brevi support for help with sign-in, summaries, credits, billing, and Chrome extension setup.",
      body: renderSupport()
    },
    "/security": {
      title: "Security - Brevi",
      description: "How Brevi protects account sessions, API secrets, checkout metadata, and article processing.",
      body: renderSecurity()
    }
  };
}

function renderHome(appUrl) {
  return `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Chrome extension for blocked article research</span>
        <h1>Brevi turns locked stories into clear open-web briefs.</h1>
        <p>When an article is behind a paywall, Brevi looks for separate public coverage, checks whether it matches the story, and gives you a concise research brief with source context.</p>
        <div class="hero-actions">
          <a class="button primary" href="#install">Get Brevi</a>
          <a class="button secondary" href="/privacy">Read privacy policy</a>
        </div>
      </div>
      <div class="product-panel" aria-label="Brevi preview">
        <div class="panel-header">
          <span class="logo-mark"></span>
          <div>
            <strong>Brevi</strong>
            <small>Open-web story brief</small>
          </div>
        </div>
        <div class="trust-grid">
          <span><em>Match</em><strong>High</strong></span>
          <span><em>Sources</em><strong>4 used</strong></span>
          <span><em>Quality</em><strong>High</strong></span>
          <span><em>Original</em><strong>Excluded</strong></span>
        </div>
        <div class="brief-lines">
          <p><strong>Key point</strong> Brevi summarizes public reporting from separate sources, not copied paywalled text.</p>
          <p><strong>Read original?</strong> Maybe, if you need details unique to the publisher.</p>
        </div>
      </div>
    </section>

    <section class="band">
      <div class="section-heading">
        <span class="eyebrow">Built for careful readers</span>
        <h2>Useful by default, transparent when it matters.</h2>
      </div>
      <div class="feature-grid">
        <article>
          <h3>Open-web coverage</h3>
          <p>Brevi searches for free sources covering the same story and keeps the original article out of the summary input.</p>
        </article>
        <article>
          <h3>Source confidence</h3>
          <p>The sidebar shows match quality, source quality, and whether reading the original may still be worthwhile.</p>
        </article>
        <article>
          <h3>Simple credits</h3>
          <p>Start with free daily summaries. Buy credit packs only when you need more briefs.</p>
        </article>
      </div>
    </section>

    <section id="install" class="install-section">
      <div>
        <span class="eyebrow">Launch checklist</span>
        <h2>Install from Chrome, sign in once, and brief the page you are reading.</h2>
        <p>Brevi uses email one-time codes for account access. Purchases are linked to your verified email and Supabase user ID.</p>
      </div>
      <a class="button primary" href="mailto:${CONTACT_EMAIL}?subject=Brevi%20Chrome%20extension%20access">Request Chrome Web Store link</a>
    </section>

    <section class="faq">
      <h2>Questions people ask before installing</h2>
      <details open>
        <summary>Does Brevi bypass paywalls?</summary>
        <p>No. Brevi does not unlock or copy paywalled article text. It finds separate public coverage and summarizes that open-web material.</p>
      </details>
      <details>
        <summary>What does Brevi send to its backend?</summary>
        <p>The extension sends the current article title, URL, visible metadata, and summary request data needed to find and verify public coverage.</p>
      </details>
      <details>
        <summary>How do credits work?</summary>
        <p>Each successful brief uses one free daily summary or one paid credit after the free allowance is used.</p>
      </details>
    </section>

    <script type="application/ld+json">${jsonLd({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Brevi",
      applicationCategory: "BrowserApplication",
      operatingSystem: "Chrome",
      description: "Chrome extension that creates open-web story briefs for locked article research.",
      url: appUrl,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      contactPoint: { "@type": "ContactPoint", email: CONTACT_EMAIL, contactType: "customer support" }
    })}</script>
  `;
}

function renderPrivacy() {
  return legalLayout("Privacy Policy", `
    <p class="updated">Last updated: ${LAST_UPDATED}</p>
    <p>Brevi is a Chrome extension that helps readers find and summarize separate open-web coverage of articles. This policy explains what we collect and how we use it.</p>

    <h2>Information we collect</h2>
    <ul>
      <li>Account information: your verified email address and Supabase user ID after email one-time-code sign-in.</li>
      <li>Extension identifiers: an install ID used as a backup identifier for credits and abuse prevention.</li>
      <li>Article request data: the current article title, URL, visible page metadata, and source URLs needed to find matching public coverage.</li>
      <li>Usage and credits: free summary counts, paid credit balance, purchase metadata, and summary event status.</li>
      <li>Technical data: basic request data such as IP address, timestamps, rate-limit keys, and backend logs needed to operate the service.</li>
    </ul>

    <h2>What we do not do</h2>
    <ul>
      <li>We do not sell personal information.</li>
      <li>We do not use the Supabase service role key in the extension.</li>
      <li>We do not intentionally collect full browsing history.</li>
      <li>We do not unlock paywalled content or copy paywalled article text into summaries.</li>
    </ul>

    <h2>How we use information</h2>
    <p>We use information to authenticate accounts, generate briefs, check story/source match quality, process credit purchases, prevent abuse, troubleshoot errors, and improve Brevi.</p>

    <h2>Service providers</h2>
    <p>Brevi may use providers such as Supabase for authentication and data storage, OpenAI for summary generation, Lemon Squeezy for checkout/payment handling, and hosting/infrastructure providers for backend operations.</p>

    <h2>Data retention</h2>
    <p>We keep account, usage, credit, and purchase records as long as needed to provide the service, maintain credit balances, comply with obligations, resolve disputes, and prevent abuse.</p>

    <h2>Your choices</h2>
    <p>You can sign out of the extension, remove the extension, or contact us to request help with account or data questions.</p>

    <h2>Contact</h2>
    <p>Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with privacy questions.</p>
  `);
}

function renderTerms() {
  return legalLayout("Terms of Service", `
    <p class="updated">Last updated: ${LAST_UPDATED}</p>
    <p>These terms govern your use of Brevi. By using the extension or related services, you agree to these terms.</p>

    <h2>Use of Brevi</h2>
    <p>Brevi helps summarize separate public coverage of stories. It is not a substitute for reading original reporting, professional advice, or verifying important facts from primary sources.</p>

    <h2>Accounts</h2>
    <p>Brevi uses email one-time-code authentication. You are responsible for keeping access to your email account secure.</p>

    <h2>Credits and payments</h2>
    <p>Paid credits are used to generate additional briefs after your free daily allowance is exhausted. Payment processing is handled by Lemon Squeezy or another listed checkout provider.</p>

    <h2>Acceptable use</h2>
    <ul>
      <li>Do not misuse Brevi to infringe intellectual property rights or violate website terms.</li>
      <li>Do not attempt to bypass access controls, scrape at scale, reverse engineer, or abuse the backend.</li>
      <li>Do not use Brevi for unlawful, harmful, or deceptive activity.</li>
    </ul>

    <h2>Availability</h2>
    <p>Brevi may change, pause, or discontinue features. We work to keep the service reliable, but we do not guarantee uninterrupted availability.</p>

    <h2>Disclaimers</h2>
    <p>Briefs may omit details, misinterpret source context, or miss updates. You should verify important information before relying on it.</p>

    <h2>Contact</h2>
    <p>Questions about these terms can be sent to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  `);
}

function renderRefunds() {
  return legalLayout("Refund Policy", `
    <p class="updated">Last updated: ${LAST_UPDATED}</p>
    <p>Brevi sells credit packs for generating briefs. We want purchases to feel clear and fair.</p>

    <h2>Refund eligibility</h2>
    <p>Contact us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> within 14 days of purchase if credits were not delivered, a duplicate purchase occurred, or a technical problem prevented reasonable use.</p>

    <h2>Used credits</h2>
    <p>Credits already used to generate briefs may not be refundable except where required by law or where we determine that a service error caused the issue.</p>

    <h2>How to request a refund</h2>
    <p>Email your purchase email, order receipt, and a short explanation. We may verify the order through Lemon Squeezy before processing the request.</p>

    <h2>Processing</h2>
    <p>Approved refunds are usually returned to the original payment method through the payment processor. Timing depends on the processor and your bank.</p>
  `);
}

function renderSupport() {
  return legalLayout("Support", `
    <p>Need help with Brevi? Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

    <h2>Include this when you contact us</h2>
    <ul>
      <li>The email you used to sign in.</li>
      <li>Your Lemon Squeezy receipt or order ID for billing issues.</li>
      <li>The article URL if a brief failed.</li>
      <li>A screenshot of the popup/sidebar if the issue is visual.</li>
    </ul>

    <h2>Common fixes</h2>
    <p>Reload the extension after updates, confirm you are signed in, and make sure the article page has fully loaded before generating a brief.</p>
  `);
}

function renderSecurity() {
  return legalLayout("Security", `
    <p class="updated">Last updated: ${LAST_UPDATED}</p>
    <p>Brevi is designed so sensitive server secrets stay on the backend. The Chrome extension only uses public configuration and user session tokens.</p>

    <h2>Authentication</h2>
    <p>Brevi uses Supabase email one-time-code authentication. Backend requests verify Supabase access tokens before trusting user identity.</p>

    <h2>Payments</h2>
    <p>Checkout is created server-side. Lemon Squeezy webhook events are verified with a signing secret before credits are granted.</p>

    <h2>Reporting security issues</h2>
    <p>Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with a clear description and reproduction steps.</p>
  `);
}

function legalLayout(title, content) {
  return `
    <section class="legal-hero">
      <span class="eyebrow">Brevi policy</span>
      <h1>${escapeHtml(title)}</h1>
      <p>Clear policies for the Brevi Chrome extension, credit purchases, and open-web story brief service.</p>
    </section>
    <article class="legal-doc">
      ${content}
    </article>
  `;
}

function renderPage({ title, description, body, path, config }) {
  const canonical = `${siteUrl(config)}${path === "/" ? "" : path}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttribute(description)}">
    <link rel="canonical" href="${escapeAttribute(canonical)}">
    <meta property="og:title" content="${escapeAttribute(title)}">
    <meta property="og:description" content="${escapeAttribute(description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeAttribute(canonical)}">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" type="image/png" href="/assets/favicons/favicon-96x96.png" sizes="96x96">
    <link rel="icon" type="image/svg+xml" href="/assets/favicons/favicon.svg">
    <link rel="shortcut icon" href="/assets/favicons/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/favicons/apple-touch-icon.png">
    <link rel="manifest" href="/assets/favicons/site.webmanifest">
    <style>${siteCss()}</style>
  </head>
  <body>
    <header class="site-header">
      <a class="brand-link" href="/" aria-label="Brevi home">
        <img src="/assets/brevi-logo-nobg.png" alt="">
        <span>Brevi</span>
      </a>
      <nav aria-label="Primary navigation">
        ${NAV_ITEMS.map((item) => `<a href="${item.href}">${item.label}</a>`).join("")}
      </nav>
    </header>
    <main>${body}</main>
    <footer>
      <div>
        <strong>Brevi</strong>
        <p>Open-web story briefs in seconds.</p>
      </div>
      <nav aria-label="Footer navigation">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/refunds">Refunds</a>
        <a href="/support">Support</a>
        <a href="/security">Security</a>
      </nav>
      <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
    </footer>
  </body>
</html>`;
}

function siteCss() {
  return `
    :root { --navy:#0B1320; --slate:#334155; --muted:#64748B; --teal:#14B8A6; --mint:#E6F7F4; --bg:#F5F7FA; --card:#FFFFFF; --border:#E2E8F0; --amber:#F59E0B; color:var(--navy); background:var(--bg); font-family:Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--navy); }
    a { color:inherit; }
    .site-header { position:sticky; top:0; z-index:10; display:flex; align-items:center; justify-content:space-between; gap:24px; padding:16px clamp(18px, 5vw, 72px); border-bottom:1px solid rgba(226,232,240,.78); background:rgba(245,247,250,.88); backdrop-filter:blur(14px); }
    .brand-link { display:inline-flex; align-items:center; gap:10px; color:var(--navy); font-size:18px; font-weight:900; text-decoration:none; }
    .brand-link img { width:34px; height:34px; border-radius:10px; object-fit:cover; }
    nav { display:flex; align-items:center; gap:18px; flex-wrap:wrap; }
    nav a { color:var(--slate); font-size:14px; font-weight:750; text-decoration:none; }
    nav a:hover { color:var(--teal); }
    main { overflow:hidden; }
    .hero { display:grid; grid-template-columns:minmax(0, 1.05fr) minmax(320px, .95fr); gap:44px; align-items:center; padding:clamp(56px, 8vw, 104px) clamp(18px, 5vw, 72px) 48px; }
    .eyebrow { display:inline-flex; margin-bottom:12px; color:#0F766E; font-size:12px; font-weight:900; letter-spacing:0; text-transform:uppercase; }
    h1 { max-width:820px; margin:0; color:var(--navy); font-size:clamp(42px, 7vw, 76px); line-height:.96; letter-spacing:0; }
    h2 { margin:0; color:var(--navy); font-size:clamp(26px, 4vw, 42px); line-height:1.05; letter-spacing:0; }
    h3 { margin:0 0 8px; color:var(--navy); font-size:18px; }
    p { color:var(--slate); font-size:16px; line-height:1.65; }
    .hero-copy > p { max-width:680px; margin:22px 0 0; font-size:19px; }
    .hero-actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:28px; }
    .button { display:inline-flex; align-items:center; justify-content:center; min-height:46px; padding:0 18px; border-radius:10px; font-size:15px; font-weight:900; text-decoration:none; }
    .button.primary { background:var(--teal); color:white; }
    .button.secondary { border:1px solid var(--border); background:white; color:var(--navy); }
    .product-panel { align-self:stretch; min-height:460px; padding:22px; border:1px solid var(--border); border-radius:18px; background:linear-gradient(180deg, white, #F8FAFC); box-shadow:0 24px 70px rgba(11,19,32,.14); }
    .panel-header { display:flex; align-items:center; gap:12px; padding-bottom:16px; border-bottom:1px solid var(--border); }
    .logo-mark { width:38px; height:38px; border-radius:11px; background:linear-gradient(135deg, transparent 58%, var(--teal) 59%), linear-gradient(var(--navy), var(--navy)); box-shadow:inset 10px 10px 0 rgba(255,255,255,.96); }
    .panel-header strong { display:block; font-size:18px; }
    .panel-header small { color:var(--muted); font-size:13px; font-weight:750; }
    .trust-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0; }
    .trust-grid span { display:grid; gap:3px; padding:12px; border:1px solid rgba(20,184,166,.2); border-radius:12px; background:var(--mint); }
    .trust-grid em { color:var(--muted); font-size:11px; font-style:normal; font-weight:900; text-transform:uppercase; }
    .trust-grid strong { font-size:15px; }
    .brief-lines { display:grid; gap:12px; }
    .brief-lines p { margin:0; padding:14px; border:1px solid var(--border); border-radius:12px; background:white; }
    .band, .faq, .install-section, .legal-hero, .legal-doc { margin:0 auto; width:min(1120px, calc(100vw - 36px)); }
    .band { padding:40px 0 64px; }
    .section-heading { max-width:720px; margin-bottom:22px; }
    .feature-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:14px; }
    .feature-grid article { padding:20px; border:1px solid var(--border); border-radius:14px; background:white; }
    .feature-grid p { margin:0; color:var(--muted); font-size:15px; }
    .install-section { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:24px; align-items:center; margin-bottom:64px; padding:26px; border:1px solid rgba(20,184,166,.22); border-radius:18px; background:var(--mint); }
    .install-section p { margin-bottom:0; }
    .faq { padding-bottom:72px; }
    .faq h2 { margin-bottom:18px; }
    details { border-top:1px solid var(--border); background:transparent; }
    details:last-child { border-bottom:1px solid var(--border); }
    summary { cursor:pointer; padding:18px 0; color:var(--navy); font-size:17px; font-weight:900; }
    details p { margin:0 0 18px; max-width:760px; }
    .legal-hero { padding:54px 0 22px; }
    .legal-hero h1 { font-size:clamp(38px, 6vw, 64px); }
    .legal-hero p { max-width:720px; margin-top:16px; }
    .legal-doc { margin-bottom:72px; padding:28px; border:1px solid var(--border); border-radius:16px; background:white; }
    .legal-doc h2 { margin:28px 0 8px; font-size:24px; }
    .legal-doc p, .legal-doc li { color:var(--slate); font-size:16px; line-height:1.7; }
    .legal-doc ul { padding-left:20px; }
    .updated { color:var(--muted); font-size:14px; }
    footer { display:flex; justify-content:space-between; gap:24px; flex-wrap:wrap; padding:26px clamp(18px, 5vw, 72px); border-top:1px solid var(--border); background:white; }
    footer p { margin:4px 0 0; color:var(--muted); font-size:14px; }
    footer a { color:var(--slate); font-size:14px; font-weight:750; text-decoration:none; }
    @media (max-width: 820px) { .site-header { align-items:flex-start; flex-direction:column; } .hero { grid-template-columns:1fr; padding-top:42px; } .product-panel { min-height:0; } .feature-grid, .install-section { grid-template-columns:1fr; } h1 { font-size:42px; } }
  `;
}

function renderRobots(config) {
  const base = siteUrl(config);
  return `User-agent: *
Allow: /
Sitemap: ${base}/sitemap.xml
`;
}

function renderSitemap(config) {
  const base = siteUrl(config);
  const paths = ["/", "/privacy", "/terms", "/refunds", "/support", "/security"];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${base}${path === "/" ? "" : path}</loc></url>`).join("\n")}
</urlset>
`;
}

function siteUrl(config) {
  return config.publicAppUrl || "https://getbrevireader.com";
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/+$/, "");
  return path || "/";
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

function sendXml(response, statusCode, text) {
  response.writeHead(statusCode, { "content-type": "application/xml; charset=utf-8" });
  response.end(text);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function jsonLd(value) {
  return JSON.stringify(value).replaceAll("</", "<\\/");
}
