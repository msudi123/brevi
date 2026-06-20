const DEFAULT_BACKEND_URL = "https://brevi-psi.vercel.app";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "BREVI_PAYWALL_DETECTED" || message?.type === "ARTICLE_INTEL_PAYWALL_DETECTED") {
    handlePaywallDetected(message.payload, sender.tab).catch((error) => {
      console.error("Brevi failed:", error);
      if (sender.tab?.id) {
        if (error.articleIntelLimit) {
          updateSidebar(sender.tab.id, {
            status: "limit",
            title: "Daily free limit reached",
            message: error.message || "You've used your free summaries today.",
            upgradeUrl: error.upgradeUrl
          });
          return;
        }

        updateSidebar(sender.tab.id, {
          status: "error",
          title: message.payload?.title || "Brevi",
          message: error.message || "Something went wrong while finding coverage."
        });
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "ARTICLE_INTEL_GET_SETTINGS") {
    getSettings().then(sendResponse);
    return true;
  }

  if (message?.type === "ARTICLE_INTEL_SAVE_SETTINGS") {
    chrome.storage.local.set({
      backendUrl: normalizeBackendUrl(message.backendUrl),
      accountEmail: message.accountEmail?.trim() || "",
      autoRunEnabled: message.autoRunEnabled !== false
    }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message?.type === "BREVI_MANUAL_SUMMARIZE") {
    summarizeActiveTab().then(sendResponse).catch((error) => {
      sendResponse({ ok: false, message: error.message });
    });
    return true;
  }

  if (message?.type === "ARTICLE_INTEL_RESET_USAGE") {
    getSettings()
      .then((settings) => fetch(`${settings.backendUrl}/api/usage/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installId: settings.installId,
          email: settings.accountEmail
        })
      }))
      .then(async (response) => sendResponse(response.ok ? await response.json() : { ok: false }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  return false;
});

async function handlePaywallDetected(article, tab) {
  if (!tab?.id || !article?.url) return;

  await injectSidebar(tab.id, {
    status: "loading",
    title: article.title || "Paywalled article detected",
    url: article.url
  });

  const settings = await getSettings();
  if (!settings.backendUrl) {
    await updateSidebar(tab.id, {
      status: "setup",
      title: article.title || "Backend setup required",
      message: "Set your Brevi backend URL from the extension popup before generating summaries."
    });
    return;
  }

  const result = await summarizeFreeCoverage(article, settings);
  await updateSidebar(tab.id, {
    status: result.status || "success",
    title: article.title || result.title || "Brevi summary",
    lockedArticle: result.lockedArticle,
    bestFreeMatch: result.bestFreeMatch,
    sourceValidation: result.sourceValidation,
    summary: result.summary,
    summaryBullets: result.summaryBullets,
    sourcesUsed: result.sourcesUsed,
    sourcesCheckedCount: result.sourcesCheckedCount,
    bestMatchSource: result.bestMatchSource,
    sourceTitle: result.sourceTitle,
    sourceUrl: result.sourceUrl,
    matchConfidence: result.matchConfidence,
    sourceQuality: result.sourceQuality,
    missingContext: result.missingContext,
    keyMissingContext: result.keyMissingContext,
    readOriginalRecommendation: result.readOriginalRecommendation,
    warning: result.warning,
    remaining: result.remaining
  });
}

async function summarizeFreeCoverage(article, settings) {
  const response = await fetch(`${settings.backendUrl}/api/summarize`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      title: article.title || "Unknown article",
      url: article.url,
      installId: settings.installId,
      email: settings.accountEmail
    })
  });

  if (!response.ok) {
    const data = await safeJson(response);
    if (response.status === 402 || response.status === 429) {
      throw Object.assign(new Error(data.message || "Daily free limit reached."), {
        articleIntelLimit: true,
        upgradeUrl: data.upgradeUrl
      });
    }
    throw new Error(data.message || `Brevi API error (${response.status})`);
  }

  return response.json();
}

async function injectSidebar(tabId, state) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["sidebar.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    func: createSidebarShell
  });

  await updateSidebar(tabId, state);
}

async function updateSidebar(tabId, state) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: renderArticleIntelSidebar,
    args: [state]
  });
}

function createSidebarShell() {
  if (document.getElementById("brevi-root")) return;

  const root = document.createElement("aside");
  root.id = "brevi-root";
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <div class="ai-shell">
      <div class="ai-header">
        <div>
          <div class="ai-kicker">Brevi</div>
          <h2 id="brevi-title">Open-web summary</h2>
        </div>
        <span id="brevi-status" class="ai-status">Checking</span>
        <button type="button" class="ai-close" aria-label="Close Brevi">&times;</button>
      </div>
      <div id="brevi-body" class="ai-body"></div>
    </div>
  `;
  document.documentElement.appendChild(root);
  root.querySelector(".ai-close")?.addEventListener("click", () => root.remove());
}

function renderArticleIntelSidebar(state) {
  function markdownBulletsToHtml(markdown) {
    const bullets = Array.isArray(markdown)
      ? markdown
      : String(markdown)
        .split("\n")
        .map((line) => ({ text: String(line).trim().replace(/^[-*]\s*/, ""), sources: [] }));

    if (bullets.length <= 1) {
      const bullet = bullets[0];
      return `<p>${formatInlineMarkdown(typeof bullet === "string" ? bullet : bullet?.text || markdown)}${renderSourceChips(bullet)}</p>`;
    }

    return `<ul>${bullets.map((bullet) => `<li>${formatInlineMarkdown(typeof bullet === "string" ? bullet : bullet.text)}${renderSourceChips(bullet)}</li>`).join("")}</ul>`;
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

  function formatInlineMarkdown(value) {
    return escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>");
  }

  function formatRating(value) {
    const normalized = String(value || "low").toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function formatRecommendationLabel(value) {
    const normalized = String(value || "maybe").toLowerCase();
    if (normalized === "yes") return "Yes";
    if (normalized === "probably_not") return "Probably not";
    return "Maybe";
  }

  function renderSourceChips(bullet) {
    const sources = Array.isArray(bullet?.sources) ? bullet.sources : [];
    if (sources.length === 0) return "";

    return ` <span class="ai-chip-row">${sources.map((source) => `
      <a class="ai-source-chip" href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.publisher || source.url)}</a>
    `).join("")}</span>`;
  }

  function renderSourcesUsed(sources, bestMatchUrl) {
    if (!Array.isArray(sources) || sources.length === 0) return "";

    const items = sources.map((source) => {
      const best = source.url === bestMatchUrl ? `<span class="ai-best">Best match</span>` : "";
      const meta = [source.publisher, source.date].filter(Boolean).map(escapeHtml).join(" · ");
      return `
        <li>
          <div class="ai-source-title">${escapeHtml(source.publisher || "Source")}</div>
          <a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || source.url)}</a>
          ${best}
          ${meta ? `<span>${meta}</span>` : ""}
          ${source.reasonUsed ? `<p>${escapeHtml(source.reasonUsed)}</p>` : ""}
          <a class="ai-mini-button" href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">Open source</a>
        </li>
      `;
    }).join("");

    return `
      <div class="ai-sources-used">
        <span>Sources used</span>
        <ol>${items}</ol>
      </div>
    `;
  }

  function renderLockedArticle(article, fallbackTitle) {
    const locked = article || {};
    return `
      <section class="ai-section">
        <h3>Locked article</h3>
        <p class="ai-article-title">${escapeHtml(locked.title || fallbackTitle || "Locked article")}</p>
        <p class="ai-domain">${escapeHtml(locked.domain || "")}</p>
      </section>
    `;
  }

  function renderBestMatch(match, sourceTitle, sourceUrl) {
    const best = match || {};
    const url = best.url || sourceUrl || "";
    const meta = [best.publisher, best.date].filter(Boolean).map(escapeHtml).join(" · ");
    return `
      <section class="ai-section ai-best-match">
        <h3>Best free match</h3>
        <p class="ai-article-title">${escapeHtml(best.title || sourceTitle || "Free source found")}</p>
        ${meta ? `<p class="ai-domain">${meta}</p>` : ""}
        ${best.reason ? `<p>${escapeHtml(best.reason)}</p>` : ""}
        ${url ? `<a class="ai-button ai-button-small" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">Open source article</a>` : ""}
      </section>
    `;
  }

  function renderReadOriginalRecommendation(recommendation, lockedArticle, bestFreeMatch, sourceUrl) {
    const rec = recommendation || {};
    const label = ["yes", "maybe", "probably_not"].includes(String(rec.label || "").toLowerCase())
      ? String(rec.label).toLowerCase()
      : "maybe";
    const reason = rec.reason || "Open-web sources cover the core facts, but the original may include extra reporting, quotes, or analysis that Brevi cannot verify.";
    const why = Array.isArray(rec.why) && rec.why.length
      ? rec.why
      : [
        "Best free match found",
        "Core facts are covered",
        "The original article body is unavailable",
        "Unique details may be missing"
      ];
    const uniqueValues = Array.isArray(rec.possibleUniqueValue) ? rec.possibleUniqueValue : [];
    const originalUrl = lockedArticle?.url || "";
    const freeUrl = bestFreeMatch?.url || sourceUrl || "";
    const primaryFirst = rec.ctaPrimary === "open_free_source" ? "free" : "original";
    const actions = [
      originalUrl ? {
        type: "original",
        label: "Open original",
        url: originalUrl,
        className: primaryFirst === "original" ? "ai-button" : "ai-button ai-secondary"
      } : null,
      freeUrl ? {
        type: "free",
        label: "Open free source",
        url: freeUrl,
        className: primaryFirst === "free" ? "ai-button" : "ai-button ai-secondary"
      } : null
    ].filter(Boolean).sort((a, b) => {
      if (a.type === primaryFirst) return -1;
      if (b.type === primaryFirst) return 1;
      return 0;
    });

    return `
      <section class="ai-section ai-read-original">
        <div class="ai-read-heading">
          <h3>Read original?</h3>
          <span class="ai-read-badge ai-read-${escapeAttribute(label)}">${escapeHtml(formatRecommendationLabel(label))}</span>
        </div>
        <p>${escapeHtml(reason)}</p>
        <div class="ai-read-meta">
          <span>Confidence: <strong>${escapeHtml(formatRating(rec.confidence))}</strong></span>
          <span>Open-web coverage: <strong>${escapeHtml(formatRating(rec.openWebCoverageStrength))}</strong></span>
        </div>
        <div class="ai-read-why">
          <span>Why Brevi says this</span>
          <ul>${why.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
        ${uniqueValues.length ? `
          <div class="ai-value-row">
            ${uniqueValues.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
          </div>
        ` : ""}
        ${actions.length ? `
          <div class="ai-read-actions">
            ${actions.map((action) => `
              <a class="${escapeAttribute(action.className)} ai-button-small" href="${escapeAttribute(action.url)}" target="_blank" rel="noreferrer">${escapeHtml(action.label)}</a>
            `).join("")}
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderSourceStats(checkedCount, usedCount) {
    if (!Number.isFinite(checkedCount)) return "";
    if (usedCount === 0) return checkedCount > 0 ? `Sources checked: ${checkedCount}` : "No reliable free match found";
    if (checkedCount <= 1) return "Best free match found: 1 source";
    return `Sources checked: ${checkedCount} · Sources used: ${usedCount}`;
  }

  const root = document.getElementById("brevi-root");
  if (!root) return;

  const title = root.querySelector("#brevi-title");
  const status = root.querySelector("#brevi-status");
  const body = root.querySelector("#brevi-body");
  if (!title || !body) return;

  title.textContent = "Open-web summary";
  if (status) {
    status.textContent = state.status === "no_reliable_free_coverage"
      ? "No match found"
      : state.status === "success" && state.matchConfidence !== "low"
      ? "Free match found"
      : state.status === "success"
        ? "No match found"
        : "Checking";
  }

  if (state.status === "loading") {
    body.innerHTML = `
      <div class="ai-loading">
        <span></span><span></span><span></span>
      </div>
      <p>Checking whether a free source covers the same story.</p>
    `;
    return;
  }

  if (state.status === "setup") {
    body.innerHTML = `
      <p>${escapeHtml(state.message)}</p>
      <p class="ai-muted">Open the Brevi popup from the Chrome toolbar to configure the backend.</p>
    `;
    return;
  }

  if (state.status === "limit") {
    body.innerHTML = `
      <p>${escapeHtml(state.message)}</p>
      <a class="ai-button" href="${escapeAttribute(state.upgradeUrl || "#")}" target="_blank" rel="noreferrer">Upgrade for unlimited summaries</a>
    `;
    return;
  }

  if (state.status === "error") {
    body.innerHTML = `
      <p>${escapeHtml(state.message || "Unable to summarize this article.")}</p>
      <p class="ai-muted">Try another article or check that your Brevi backend is running.</p>
    `;
    return;
  }

  if (state.status === "no_reliable_free_coverage") {
    const originalUrl = state.lockedArticle?.url || "";
    title.textContent = "No reliable free coverage found";
    body.innerHTML = `
      <p>Brevi found the original article, but could not find a separate open-web source that clearly covers the same story.</p>
      ${renderLockedArticle(state.lockedArticle, state.title)}
      <div class="ai-footer">
        <p>${escapeHtml(renderSourceStats(state.sourcesCheckedCount, 0))}</p>
        <p>${Number.isFinite(state.remaining) ? `${state.remaining} free summaries left today` : ""}</p>
        <div class="ai-actions">
          ${originalUrl ? `<a class="ai-button" href="${escapeAttribute(originalUrl)}" target="_blank" rel="noreferrer">Open original article</a>` : ""}
          <button type="button" class="ai-button ai-secondary" id="brevi-check-again">Try another search</button>
        </div>
      </div>
    `;
    body.querySelector("#brevi-check-again")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "BREVI_MANUAL_SUMMARIZE" });
    });
    return;
  }

  const isLowConfidence = state.matchConfidence === "low";
  const summaryHtml = isLowConfidence
    ? `<p>${escapeHtml(state.warning || "No reliable free coverage was found for the same story.")}</p>`
    : markdownBulletsToHtml(state.summaryBullets || state.summary || "No summary returned.");
  const standardWarning = "Based on free sources. May not include details unique to the original paywalled article.";
  const warning = `<div class="ai-warning">${escapeHtml(standardWarning)}</div>`;
  const caution = state.warning && state.warning !== standardWarning
    ? `<div class="ai-caution">${escapeHtml(state.warning)}</div>`
    : "";
  const missingContext = `<div class="ai-context"><span>What may be missing</span><p>${escapeHtml("Brevi could not access the original paywalled article body, so details unique to that article may be missing.")}</p></div>`;
  const sourcesUsedCount = Array.isArray(state.sourcesUsed) ? state.sourcesUsed.length : 0;
  const bestMatchUrl = state.bestFreeMatch?.url || state.sourceUrl || "";
  const sourcesUsed = renderSourcesUsed(state.sourcesUsed, bestMatchUrl);
  const sourceStats = renderSourceStats(state.sourcesCheckedCount, sourcesUsedCount);
  const readOriginal = renderReadOriginalRecommendation(
    state.readOriginalRecommendation,
    state.lockedArticle,
    state.bestFreeMatch,
    state.sourceUrl
  );

  body.innerHTML = `
    <div class="ai-ratings">
      <span>Match: <strong>${escapeHtml(formatRating(state.matchConfidence))}</strong></span>
      <span>Source quality: <strong>${escapeHtml(formatRating(state.sourceQuality))}</strong></span>
    </div>
    ${warning}
    ${caution}
    ${renderLockedArticle(state.lockedArticle, state.title)}
    ${renderBestMatch(state.bestFreeMatch, state.sourceTitle, state.sourceUrl)}
    <section class="ai-section">
      <h3>Key points from free coverage</h3>
      <div class="ai-summary">${summaryHtml}</div>
    </section>
    ${readOriginal}
    ${sourcesUsed}
    ${missingContext}
    <div class="ai-footer">
      <p>${escapeHtml(sourceStats)}</p>
      <p>${Number.isFinite(state.remaining) ? `${state.remaining} free summaries left today` : ""}</p>
      <div class="ai-actions">
        <button type="button" class="ai-button ai-secondary" id="brevi-check-again">Check another source</button>
        <a class="ai-button" href="${escapeAttribute(state.upgradeUrl || "https://whop.com")}" target="_blank" rel="noreferrer">Upgrade</a>
      </div>
    </div>
  `;

  body.querySelector("#brevi-check-again")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "BREVI_MANUAL_SUMMARIZE" });
  });
}

async function summarizeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new Error("No active tab found.");
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractArticleFromPage
  });

  await handlePaywallDetected(result.result || { title: tab.title, url: tab.url }, tab);
  return { ok: true };
}

function extractArticleFromPage() {
  const ogTitle = document.querySelector("meta[property='og:title']")?.content;
  const twitterTitle = document.querySelector("meta[name='twitter:title']")?.content;
  const headline = document.querySelector("h1")?.innerText;
  const title = String(ogTitle || twitterTitle || headline || document.title || "Untitled article")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    url: location.href
  };
}

async function getSettings() {
  const data = await chrome.storage.local.get(["backendUrl", "accountEmail", "installId"]);
  let installId = data.installId;
  if (!installId) {
    installId = crypto.randomUUID();
    await chrome.storage.local.set({ installId });
  }

  return {
    backendUrl: normalizeBackendUrl(data.backendUrl || DEFAULT_BACKEND_URL),
    accountEmail: data.accountEmail || "",
    installId
  };
}

function normalizeBackendUrl(value) {
  return String(value || DEFAULT_BACKEND_URL).trim().replace(/\/+$/, "");
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}
