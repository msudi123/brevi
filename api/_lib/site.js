const CONTACT_EMAIL = "getbrevi@gmail.com";
const LAST_UPDATED = "June 20, 2026";
const GOOGLE_TAG_ID = "G-C7KV5GVSWT";
const CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/detail/bpjaljnecngdfcbnejkgeeahncepjlid?utm_source=item-share-cb";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/#install", label: "Install" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" }
];

export function handleSiteRequest(request, response, config) {
  const url = new URL(request.url || "/", `https://${request.headers.host || "getbrevi.dev"}`);
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
        <span class="status-pill">Approved on the Chrome Web Store</span>
        <h1>Understand locked stories without breaking the web.</h1>
        <p>Brevi is a Chrome extension that helps careful readers research paywalled or blocked articles by finding separate public coverage, checking story match, and turning the open-web reporting into a concise brief.</p>
        <div class="hero-actions">
          <a class="button primary" href="${CHROME_WEB_STORE_URL}" target="_blank" rel="noopener">Add to Chrome</a>
          <a class="button secondary" href="#how-it-works">See how it works</a>
          <a class="button secondary" href="/privacy">Read privacy policy</a>
        </div>
        <div class="proof-strip" aria-label="Brevi highlights">
          <span><strong>Open-web only</strong> Uses separate public sources</span>
          <span><strong>Source aware</strong> Shows match and quality signals</span>
          <span><strong>Simple access</strong> Email sign-in and daily free briefs</span>
        </div>
      </div>
      <div class="product-panel" aria-label="Brevi preview">
        <div class="panel-header">
          <img src="/assets/brevi-logo-nobg.png" alt="">
          <div>
            <strong>Brevi</strong>
            <small>Chrome extension sidebar</small>
          </div>
        </div>
        <div class="article-chip">
          <span>Current page</span>
          <strong>Premium story detected</strong>
        </div>
        <div class="trust-grid">
          <span><em>Match</em><strong>High</strong></span>
          <span><em>Public sources</em><strong>4 found</strong></span>
          <span><em>Quality</em><strong>Strong</strong></span>
          <span><em>Original</em><strong>Excluded</strong></span>
        </div>
        <div class="brief-lines">
          <p><strong>Brief</strong> Brevi compares public reporting, extracts the shared facts, and flags what may still require the original article.</p>
          <p><strong>Source context</strong> The summary is based on open pages that independently cover the same story.</p>
        </div>
        <a class="store-card" href="${CHROME_WEB_STORE_URL}" target="_blank" rel="noopener">
          <span>Available now</span>
          <strong>Install from the Chrome Web Store</strong>
        </a>
      </div>
    </section>

    <section id="how-it-works" class="band">
      <div class="section-heading">
        <span class="eyebrow">How Brevi works</span>
        <h2>A research assistant for the page you are already reading.</h2>
      </div>
      <div class="feature-grid">
        <article>
          <span class="step">1</span>
          <h3>Open the article</h3>
          <p>When a page is blocked or paywalled, open Brevi from your browser toolbar or sidebar.</p>
        </article>
        <article>
          <span class="step">2</span>
          <h3>Find public coverage</h3>
          <p>Brevi looks for separate open-web sources about the same story and checks whether they match.</p>
        </article>
        <article>
          <span class="step">3</span>
          <h3>Read the brief</h3>
          <p>Get the key points, source context, and a signal for whether the original is still worth reading.</p>
        </article>
      </div>
    </section>

    <section class="reader-section">
      <div class="section-heading">
        <span class="eyebrow">Why readers use it</span>
        <h2>Less friction, more context, and a cleaner decision about what deserves your time.</h2>
      </div>
      <div class="reader-grid">
        <article>
          <h3>For news catch-up</h3>
          <p>Quickly understand the public facts around a story when the first link you open is unavailable.</p>
        </article>
        <article>
          <h3>For research trails</h3>
          <p>Use the source list and confidence signals to keep moving without losing track of where claims came from.</p>
        </article>
        <article>
          <h3>For fair reading</h3>
          <p>Brevi does not unlock paywalled text. It summarizes separate public reporting and tells you when the original may matter.</p>
        </article>
        <article>
          <h3>For occasional use</h3>
          <p>Start with daily free briefs. Paid credits are there only when you need more.</p>
        </article>
      </div>
    </section>

    <section id="install" class="install-section">
      <div>
        <span class="eyebrow">Approved and ready</span>
        <h2>Add Brevi to Chrome and brief your next locked article.</h2>
        <p>Install from the Chrome Web Store, sign in with your email, and use Brevi on supported article pages. Free daily summaries are included.</p>
      </div>
      <a class="button primary" href="${CHROME_WEB_STORE_URL}" target="_blank" rel="noopener">Open Chrome Web Store</a>
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
      <details>
        <summary>Is Brevi available now?</summary>
        <p>Yes. Brevi has been approved for the Chrome Web Store and can be installed from the official listing linked on this page.</p>
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
      installUrl: CHROME_WEB_STORE_URL,
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

function renderSupport() {
  return legalLayout("Support", `
    <p>Need help with Brevi? Send a message here or email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

    <form class="support-form" id="supportForm">
      <div class="form-grid">
        <label>
          <span>Name</span>
          <input name="name" autocomplete="name" placeholder="Your name">
        </label>
        <label>
          <span>Email</span>
          <input name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
        </label>
      </div>
      <label>
        <span>What is this about?</span>
        <select name="category">
          <option value="general">General question</option>
          <option value="billing">Billing</option>
          <option value="credits">Credits</option>
          <option value="bug">Bug report</option>
          <option value="feedback">Product feedback</option>
          <option value="security">Security</option>
        </select>
      </label>
      <label>
        <span>Subject</span>
        <input name="subject" maxlength="160" placeholder="Short summary">
      </label>
      <label>
        <span>Message</span>
        <textarea name="message" rows="7" minlength="10" maxlength="4000" placeholder="Tell us what happened, what you expected, and any article/order details that help." required></textarea>
      </label>
      <label class="field-trap" aria-hidden="true">
        <span>Company</span>
        <input name="company" tabindex="-1" autocomplete="off">
      </label>
      <button class="button primary" type="submit">Send message</button>
      <p class="form-status" id="supportStatus" role="status"></p>
    </form>

    <h2>Include this when you contact us</h2>
    <ul>
      <li>The email you used to sign in.</li>
      <li>Your Lemon Squeezy receipt or order ID for billing issues.</li>
      <li>The article URL if a brief failed.</li>
      <li>A screenshot of the popup/sidebar if the issue is visual.</li>
    </ul>

    <h2>Common fixes</h2>
    <p>Reload the extension after updates, confirm you are signed in, and make sure the article page has fully loaded before generating a brief.</p>
    <script>${supportFormScript()}</script>
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
    ${googleTag()}
    ${posthogTag(config)}
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
        <a href="/support">Support</a>
        <a href="/security">Security</a>
      </nav>
      <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
    </footer>
  </body>
</html>`;
}

function googleTag() {
  return `<!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', '${GOOGLE_TAG_ID}');
    </script>`;
}

function posthogTag(config) {
  if (!config.posthogProjectKey) return "";

  const apiHost = config.posthogApiHost || "https://us.i.posthog.com";
  return `<!-- PostHog -->
    <script>
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags reloadFeatureFlags getFeatureFlag getFeatureFlagPayload group".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
      posthog.init("${escapeScript(config.posthogProjectKey)}", {
        api_host: "${escapeScript(apiHost)}",
        capture_pageview: true,
        persistence: "localStorage+cookie",
        person_profiles: "identified_only"
      });
      document.addEventListener("click", function(event) {
        var link = event.target.closest && event.target.closest("a[href*='chromewebstore.google.com']");
        if (!link || !window.posthog) return;
        posthog.capture("chrome_web_store_click", {
          link_text: (link.textContent || "").trim().slice(0, 80),
          page_path: window.location.pathname
        });
      });
    </script>`;
}

function siteCss() {
  return `
    :root { --navy:#0B1320; --slate:#334155; --muted:#64748B; --teal:#14B8A6; --teal-dark:#0F766E; --mint:#E6F7F4; --bg:#F5F7FA; --card:#FFFFFF; --border:#E2E8F0; --amber:#F59E0B; --rose:#BE123C; color:var(--navy); background:var(--bg); font-family:Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }
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
    .hero { display:grid; grid-template-columns:minmax(0, 1.05fr) minmax(320px, .95fr); gap:44px; align-items:center; padding:clamp(56px, 8vw, 104px) clamp(18px, 5vw, 72px) 44px; background:linear-gradient(180deg, #FFFFFF 0%, var(--bg) 82%); }
    .eyebrow { display:inline-flex; margin-bottom:12px; color:var(--teal-dark); font-size:12px; font-weight:900; letter-spacing:0; text-transform:uppercase; }
    .status-pill { display:inline-flex; align-items:center; min-height:32px; margin-bottom:14px; padding:0 12px; border:1px solid rgba(20,184,166,.3); border-radius:999px; background:var(--mint); color:var(--teal-dark); font-size:13px; font-weight:900; }
    h1 { max-width:820px; margin:0; color:var(--navy); font-size:clamp(42px, 7vw, 76px); line-height:.96; letter-spacing:0; }
    h2 { margin:0; color:var(--navy); font-size:clamp(26px, 4vw, 42px); line-height:1.05; letter-spacing:0; }
    h3 { margin:0 0 8px; color:var(--navy); font-size:18px; }
    p { color:var(--slate); font-size:16px; line-height:1.65; }
    .hero-copy > p { max-width:680px; margin:22px 0 0; font-size:19px; }
    .hero-actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:28px; }
    .button { display:inline-flex; align-items:center; justify-content:center; min-height:46px; padding:0 18px; border-radius:10px; font-size:15px; font-weight:900; text-decoration:none; transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
    .button:hover { transform:translateY(-1px); }
    .button.primary { background:var(--teal); color:white; box-shadow:0 12px 30px rgba(20,184,166,.25); }
    .button.secondary { border:1px solid var(--border); background:white; color:var(--navy); }
    .button.secondary:hover { border-color:rgba(20,184,166,.48); }
    .proof-strip { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; max-width:760px; margin-top:28px; }
    .proof-strip span { display:grid; gap:2px; min-height:72px; padding:12px; border-left:3px solid var(--teal); background:rgba(255,255,255,.76); color:var(--muted); font-size:13px; line-height:1.35; }
    .proof-strip strong { color:var(--navy); font-size:14px; }
    .product-panel { align-self:stretch; min-height:510px; padding:22px; border:1px solid var(--border); border-radius:18px; background:linear-gradient(180deg, white, #F8FAFC); box-shadow:0 24px 70px rgba(11,19,32,.14); }
    .panel-header { display:flex; align-items:center; gap:12px; padding-bottom:16px; border-bottom:1px solid var(--border); }
    .panel-header img { width:42px; height:42px; border-radius:12px; object-fit:cover; }
    .panel-header strong { display:block; font-size:18px; }
    .panel-header small { color:var(--muted); font-size:13px; font-weight:750; }
    .article-chip { display:grid; gap:4px; margin:18px 0 0; padding:14px; border:1px solid rgba(245,158,11,.3); border-radius:12px; background:#FFFBEB; }
    .article-chip span { color:#92400E; font-size:11px; font-weight:900; text-transform:uppercase; }
    .article-chip strong { color:var(--navy); font-size:16px; }
    .trust-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0; }
    .trust-grid span { display:grid; gap:3px; padding:12px; border:1px solid rgba(20,184,166,.2); border-radius:12px; background:var(--mint); }
    .trust-grid em { color:var(--muted); font-size:11px; font-style:normal; font-weight:900; text-transform:uppercase; }
    .trust-grid strong { font-size:15px; }
    .brief-lines { display:grid; gap:12px; }
    .brief-lines p { margin:0; padding:14px; border:1px solid var(--border); border-radius:12px; background:white; }
    .store-card { display:grid; gap:4px; margin-top:16px; padding:16px; border:1px solid rgba(15,118,110,.28); border-radius:12px; background:var(--navy); color:white; text-decoration:none; }
    .store-card span { color:#A7F3D0; font-size:12px; font-weight:900; text-transform:uppercase; }
    .store-card strong { font-size:18px; }
    .band, .reader-section, .faq, .install-section, .legal-hero, .legal-doc { margin:0 auto; width:min(1120px, calc(100vw - 36px)); }
    .band { padding:40px 0 64px; }
    .section-heading { max-width:720px; margin-bottom:22px; }
    .feature-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:14px; }
    .feature-grid article { padding:20px; border:1px solid var(--border); border-radius:14px; background:white; }
    .step { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; margin-bottom:18px; border-radius:50%; background:var(--navy); color:white; font-size:14px; font-weight:900; }
    .feature-grid p { margin:0; color:var(--muted); font-size:15px; }
    .reader-section { padding:0 0 64px; }
    .reader-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:1px; border:1px solid var(--border); background:var(--border); }
    .reader-grid article { min-height:210px; padding:20px; background:white; }
    .reader-grid article:nth-child(2) { border-top:4px solid var(--amber); }
    .reader-grid article:nth-child(3) { border-top:4px solid var(--rose); }
    .reader-grid article:nth-child(4) { border-top:4px solid var(--teal); }
    .reader-grid p { margin:0; color:var(--muted); font-size:15px; }
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
    .support-form { display:grid; gap:14px; margin:24px 0 8px; padding:18px; border:1px solid var(--border); border-radius:14px; background:#F8FAFC; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .support-form label { display:grid; gap:7px; color:var(--navy); font-size:13px; font-weight:900; }
    .support-form input, .support-form select, .support-form textarea { width:100%; border:1px solid var(--border); border-radius:10px; background:white; color:var(--navy); font:inherit; font-size:15px; }
    .support-form input, .support-form select { min-height:44px; padding:0 12px; }
    .support-form textarea { resize:vertical; min-height:150px; padding:12px; line-height:1.5; }
    .support-form input:focus, .support-form select:focus, .support-form textarea:focus { border-color:var(--teal); box-shadow:0 0 0 3px rgba(20,184,166,.14); outline:0; }
    .support-form button { width:max-content; border:0; cursor:pointer; }
    .support-form button:disabled { cursor:not-allowed; opacity:.68; }
    .form-status { min-height:22px; margin:0; color:#0F766E; font-size:14px; font-weight:800; }
    .form-status.error { color:#B45309; }
    .field-trap { position:absolute; left:-10000px; width:1px; height:1px; overflow:hidden; }
    footer { display:flex; justify-content:space-between; gap:24px; flex-wrap:wrap; padding:26px clamp(18px, 5vw, 72px); border-top:1px solid var(--border); background:white; }
    footer p { margin:4px 0 0; color:var(--muted); font-size:14px; }
    footer a { color:var(--slate); font-size:14px; font-weight:750; text-decoration:none; }
    @media (max-width: 980px) { .reader-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 820px) { .site-header { align-items:flex-start; flex-direction:column; } .hero { grid-template-columns:1fr; padding-top:42px; } .product-panel { min-height:0; } .feature-grid, .install-section, .form-grid, .proof-strip { grid-template-columns:1fr; } h1 { font-size:42px; } }
    @media (max-width: 560px) { nav { gap:12px; } .hero-actions .button, .install-section .button { width:100%; } .reader-grid { grid-template-columns:1fr; } .trust-grid { grid-template-columns:1fr; } }
  `;
}

function supportFormScript() {
  return `
    (() => {
      const form = document.getElementById("supportForm");
      const status = document.getElementById("supportStatus");
      if (!form || !status) return;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector("button[type='submit']");
        const payload = Object.fromEntries(new FormData(form).entries());
        status.className = "form-status";
        status.textContent = "Sending...";
        button.disabled = true;
        try {
          const response = await fetch("/api/support/message", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data.ok === false) {
            throw new Error(data.message || "Could not send your message.");
          }
          form.reset();
          status.textContent = data.message || "Thanks. Your message was sent.";
        } catch (error) {
          status.className = "form-status error";
          status.textContent = error.message || "Could not send your message.";
        } finally {
          button.disabled = false;
        }
      });
    })();
  `.replaceAll("</", "<\\/");
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
  const paths = ["/", "/privacy", "/terms", "/support", "/security"];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${base}${path === "/" ? "" : path}</loc></url>`).join("\n")}
</urlset>
`;
}

function siteUrl(config) {
  return config.publicAppUrl || "https://www.getbrevi.dev";
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

function escapeScript(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("</", "<\\/");
}

function jsonLd(value) {
  return JSON.stringify(value).replaceAll("</", "<\\/");
}
