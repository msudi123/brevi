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
            buyCredits: error.buyCredits
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
    summarizeActiveTab({
      excludedSourceUrls: Array.isArray(message.excludedSourceUrls) ? message.excludedSourceUrls : []
    }).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, message: error.message });
    });
    return true;
  }

  if (message?.type === "ARTICLE_INTEL_RESET_USAGE") {
    getSettings()
      .then((settings) => fetch(`${settings.backendUrl}/api/usage/reset`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(settings.authSession?.access_token ? { authorization: `Bearer ${settings.authSession.access_token}` } : {})
        },
        body: JSON.stringify({
          installId: settings.installId,
          email: settings.accountEmail
        })
      }))
      .then(async (response) => sendResponse(response.ok ? await response.json() : { ok: false }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message?.type === "BREVI_OPEN_POPUP_FOR_CREDITS") {
    chrome.action.openPopup().catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

async function handlePaywallDetected(article, tab, options = {}) {
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

  const result = await summarizeFreeCoverage(article, settings, options);
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
    remaining: result.remaining,
    buyCredits: result.buyCredits,
    paid: result.paid,
    paidCreditUsed: result.paidCreditUsed,
    paidCredits: result.paidCredits
  });
}

async function summarizeFreeCoverage(article, settings, options = {}) {
  const response = await fetch(`${settings.backendUrl}/api/summarize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(settings.authSession?.access_token ? { authorization: `Bearer ${settings.authSession.access_token}` } : {})
      },
      body: JSON.stringify({
        title: article.title || "Unknown article",
        url: article.url,
        installId: settings.installId,
      email: settings.accountEmail,
      excludedSourceUrls: Array.isArray(options.excludedSourceUrls) ? options.excludedSourceUrls : []
    })
  });

  if (!response.ok) {
    const data = await safeJson(response);
    if (response.status === 402 || response.status === 429) {
      throw Object.assign(new Error(data.message || "Daily free limit reached."), {
        articleIntelLimit: true,
        buyCredits: data.buyCredits
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
        <div class="ai-brand">
          <div class="ai-logo-wrap">
            <img class="ai-logo" src="${chrome.runtime.getURL("assets/brevi-logo-nobg.png")}" alt="">
          </div>
          <div class="ai-heading">
            <div class="ai-product">Brevi</div>
            <h2 id="brevi-title">Open-web story brief</h2>
          </div>
        </div>
        <div class="ai-header-side">
          <span id="brevi-header-meta" class="ai-header-meta">Checking</span>
          <span id="brevi-status" class="ai-status">Checking</span>
        </div>
        <button type="button" class="ai-close" aria-label="Close Brevi"></button>
      </div>
      <div id="brevi-body" class="ai-body"></div>
    </div>
  `;
  document.documentElement.appendChild(root);
  root.querySelector(".ai-close")?.addEventListener("click", () => root.remove());
}

function renderArticleIntelSidebar(state) {
  const PACK_TOTALS = [50, 150, 400];
  const TRUST_NOTE = "Based on separate open-web sources. Brevi may miss details unique to the original article.";

  function markdownBulletsToHtml(markdown) {
    const bullets = Array.isArray(markdown)
      ? markdown
      : String(markdown)
        .split("\n")
        .map((line) => ({ text: String(line).trim().replace(/^[-*]\s*/, ""), sources: [] }));

    if (bullets.length <= 1) {
      const bullet = bullets[0];
      return `<p class="ai-summary-line">${formatInlineMarkdown(typeof bullet === "string" ? bullet : bullet?.text || markdown)}${renderSourceChips(bullet)}</p>`;
    }

    return `<ul>${bullets.map((bullet) => `<li><span>${formatInlineMarkdown(typeof bullet === "string" ? bullet : bullet.text)}</span>${renderSourceChips(bullet)}</li>`).join("")}</ul>`;
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

  function ratingClass(value) {
    const normalized = String(value || "low").toLowerCase();
    if (normalized === "high") return "high";
    if (normalized === "medium") return "medium";
    return "low";
  }

  function formatRecommendationLabel(value) {
    const normalized = String(value || "maybe").toLowerCase();
    if (normalized === "yes") return "Yes";
    if (normalized === "probably_not") return "Probably not";
    return "Maybe";
  }

  function publisherName(source) {
    const explicit = String(source?.publisher || "").trim();
    if (explicit) return explicit;
    try {
      const host = new URL(source?.url || "").hostname.replace(/^www\./, "");
      return host || "Source";
    } catch (error) {
      return "Source";
    }
  }

  function card(title, content, className = "") {
    return `
      <section class="ai-card ${escapeAttribute(className)}">
        ${title ? `<div class="ai-card-title">${escapeHtml(title)}</div>` : ""}
        ${content}
      </section>
    `;
  }

  function renderHeaderMeta(currentState) {
    const paidCredits = Number(currentState.paidCredits || 0);
    if (paidCredits > 0) return `${paidCredits} credits`;
    if (Number.isFinite(currentState.remaining)) return `${currentState.remaining} free left`;
    if (currentState.status === "loading") return "Researching";
    if (currentState.status === "limit") return "0 free left";
    return "Ready";
  }

  function renderSourceChips(bullet) {
    const sources = Array.isArray(bullet?.sources) ? bullet.sources : [];
    if (sources.length === 0) return "";

    return `<span class="ai-chip-row">${sources.map((source) => `
      <a class="ai-source-chip" href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(publisherName(source))}</a>
    `).join("")}</span>`;
  }

  function renderStoryStatusCard(currentState) {
    const usedCount = Array.isArray(currentState.sourcesUsed) ? currentState.sourcesUsed.length : 0;
    const badges = [
      { label: "Match", value: formatRating(currentState.matchConfidence), tone: ratingClass(currentState.matchConfidence) },
      { label: "Source quality", value: formatRating(currentState.sourceQuality), tone: ratingClass(currentState.sourceQuality) },
      { label: "Sources used", value: String(usedCount || currentState.sourcesCheckedCount || 0), tone: usedCount > 0 ? "high" : "low" },
      { label: "Original excluded", value: "Yes", tone: "neutral" }
    ];

    return card("Story status", `
      <div class="ai-badge-grid">
        ${badges.map((badge) => `
          <span class="ai-pill ai-pill-${escapeAttribute(badge.tone)}">
            <em>${escapeHtml(badge.label)}</em>
            <strong>${escapeHtml(badge.value)}</strong>
          </span>
        `).join("")}
      </div>
    `, "ai-status-card");
  }

  function renderKeyPointsCard(summaryHtml) {
    return card("Key points", `<div class="ai-summary">${summaryHtml}</div>`, "ai-keypoints-card");
  }

  function renderSourcesCard(sources, bestMatchUrl) {
    if (!Array.isArray(sources) || sources.length === 0) return "";

    const items = sources.map((source) => {
      const best = source.url === bestMatchUrl ? `<span class="ai-best">Best match</span>` : "";
      const meta = [source.date].filter(Boolean).map(escapeHtml).join(" · ");
      return `
        <article class="ai-source-item">
          <div class="ai-source-head">
            <div>
              <div class="ai-source-title">${escapeHtml(publisherName(source))}</div>
              <a class="ai-source-link" href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || "Open-web source")}</a>
            </div>
            ${best}
          </div>
          ${meta ? `<p class="ai-source-meta">${meta}</p>` : ""}
          ${source.reasonUsed ? `<p class="ai-source-reason">${escapeHtml(source.reasonUsed)}</p>` : ""}
          <a class="ai-mini-button" href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">Open source</a>
        </article>
      `;
    }).join("");

    return card("Sources used", `<div class="ai-sources-list">${items}</div>`, "ai-sources-card");
  }

  function renderLockedArticle(article, fallbackTitle) {
    const locked = article || {};
    return card("Original article", `
        <p class="ai-article-title">${escapeHtml(locked.title || fallbackTitle || "Locked article")}</p>
        ${locked.domain ? `<p class="ai-domain">${escapeHtml(locked.domain)}</p>` : ""}
      `, "ai-original-card");
  }

  function renderBestMatch(match, sourceTitle, sourceUrl) {
    const best = match || {};
    const url = best.url || sourceUrl || "";
    const meta = [publisherName(best), best.date].filter(Boolean).map(escapeHtml).join(" · ");
    return card("Best free match", `
        <p class="ai-article-title">${escapeHtml(best.title || sourceTitle || "Free source found")}</p>
        ${meta ? `<p class="ai-domain">${meta}</p>` : ""}
        ${best.reason ? `<p>${escapeHtml(best.reason)}</p>` : ""}
        ${url ? `<a class="ai-button ai-button-small" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">Open free source</a>` : ""}
      `, "ai-best-match");
  }

  function renderReadOriginalCard(recommendation, lockedArticle, bestFreeMatch, sourceUrl) {
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

    return card("", `
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
      `, "ai-read-original");
  }

  function renderSourceStats(checkedCount, usedCount) {
    if (!Number.isFinite(checkedCount)) return "";
    if (usedCount === 0) return checkedCount > 0 ? `Sources checked: ${checkedCount}` : "No reliable free match found";
    if (checkedCount <= 1) return "Best free match found: 1 source";
    return `Sources checked: ${checkedCount} · Sources used: ${usedCount}`;
  }

  function collectDisplayedSourceUrls(currentState) {
    const urls = [
      currentState.sourceUrl,
      currentState.bestFreeMatch?.url,
      ...(Array.isArray(currentState.sourcesUsed) ? currentState.sourcesUsed.map((source) => source.url) : []),
      ...(Array.isArray(currentState.summaryBullets)
        ? currentState.summaryBullets.flatMap((bullet) => Array.isArray(bullet.sources) ? bullet.sources.map((source) => source.url) : [])
        : [])
    ];

    return [...new Set(urls.filter(Boolean))];
  }

  function requestSearchAgain(currentState) {
    chrome.runtime.sendMessage({
      type: "BREVI_MANUAL_SUMMARIZE",
      excludedSourceUrls: collectDisplayedSourceUrls(currentState)
    });
  }

  function requestBuyCredits() {
    chrome.runtime.sendMessage({ type: "BREVI_OPEN_POPUP_FOR_CREDITS" });
  }

  function inferCreditTotal(remaining) {
    const normalized = Math.max(0, Number(remaining || 0));
    return PACK_TOTALS.find((total) => normalized <= total) || PACK_TOTALS[PACK_TOTALS.length - 1];
  }

  function renderCreditsProgress(currentState) {
    const creditsRemaining = Math.max(0, Number(currentState.paidCredits || 0));
    const creditsTotal = creditsRemaining > 0 ? inferCreditTotal(creditsRemaining) : PACK_TOTALS[0];
    const percent = creditsTotal > 0 ? Math.max(0, Math.min(100, Math.round((creditsRemaining / creditsTotal) * 100))) : 0;
    const isZero = creditsRemaining === 0;
    const isLow = !isZero && creditsRemaining <= creditsTotal * 0.2;
    const tone = isZero ? "empty" : isLow ? "low" : "normal";
    const helper = isZero
      ? "No credits left. Buy a credit pack to continue generating briefs."
      : isLow
        ? "Credits running low."
        : "Each brief uses 1 credit.";

    return card("", `
      <div class="ai-credits-head">
        <span>Credits remaining</span>
        <strong>${creditsRemaining} / ${creditsTotal}</strong>
      </div>
      <div class="ai-progress-track" aria-label="Credits remaining">
        <span class="ai-progress-fill ai-progress-${tone}" style="width: ${percent}%"></span>
      </div>
      <p class="ai-credit-helper">${escapeHtml(helper)}</p>
      ${!isZero && !isLow ? `<p class="ai-credit-subhelper">Each brief uses 1 credit.</p>` : ""}
      <button type="button" class="ai-button ai-button-full" id="brevi-buy-credits-progress">Buy credits</button>
    `, "ai-credits-card");
  }

  function renderFooterActions(currentState, originalUrl = "") {
    return card("", `
      <div class="ai-footer-meta">
        ${currentState.paidCreditUsed
          ? `<span>1 paid credit used</span>`
          : Number.isFinite(currentState.remaining)
            ? `<span>${currentState.remaining} free summaries left today</span>`
            : `<span>Ready for another search</span>`}
      </div>
      <div class="ai-actions">
        ${originalUrl ? `<a class="ai-button ai-secondary" href="${escapeAttribute(originalUrl)}" target="_blank" rel="noreferrer">Open original article</a>` : ""}
        <button type="button" class="ai-button ai-secondary" id="brevi-check-again">Try another source</button>
        <button type="button" class="ai-button" id="brevi-buy-credits">Buy credits</button>
      </div>
    `, "ai-footer-card");
  }

  function attachCommonActions(currentState) {
    body.querySelectorAll("#brevi-check-again").forEach((button) => {
      button.addEventListener("click", () => requestSearchAgain(currentState));
    });
    body.querySelectorAll("#brevi-buy-credits, #brevi-buy-credits-progress").forEach((button) => {
      button.addEventListener("click", requestBuyCredits);
    });
  }

  const root = document.getElementById("brevi-root");
  if (!root) return;

  const title = root.querySelector("#brevi-title");
  const status = root.querySelector("#brevi-status");
  const headerMeta = root.querySelector("#brevi-header-meta");
  const body = root.querySelector("#brevi-body");
  if (!title || !body) return;

  title.textContent = "Open-web story brief";
  if (headerMeta) {
    headerMeta.textContent = renderHeaderMeta(state);
  }
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
      ${card("Building brief", `
        <div class="ai-loading-orbit"><span></span><span></span><span></span></div>
        <ol class="ai-progress-steps">
          <li class="active">Finding open-web coverage</li>
          <li>Checking story match</li>
          <li>Verifying sources</li>
          <li>Building brief</li>
        </ol>
      `, "ai-loading-card")}
    `;
    return;
  }

  if (state.status === "setup") {
    body.innerHTML = `
      ${card("Backend setup required", `
        <p>${escapeHtml(state.message)}</p>
        <p class="ai-muted">Open the Brevi popup from the Chrome toolbar to configure the backend.</p>
      `, "ai-state-card")}
    `;
    return;
  }

  if (state.status === "limit") {
    body.innerHTML = `
      ${card("Daily free limit reached", `
        <p>${escapeHtml(state.message)}</p>
        <button type="button" class="ai-button ai-button-full" id="brevi-buy-credits">Buy credits</button>
      `, "ai-state-card")}
      ${renderCreditsProgress(state)}
    `;
    attachCommonActions(state);
    return;
  }

  if (state.status === "error") {
    body.innerHTML = `
      ${card("Something went wrong", `
        <p>${escapeHtml(state.message || "Unable to summarize this article.")}</p>
        <p class="ai-muted">Try another article or check that your Brevi backend is running.</p>
      `, "ai-state-card")}
    `;
    return;
  }

  if (state.status === "no_reliable_free_coverage") {
    const originalUrl = state.lockedArticle?.url || "";
    title.textContent = "No reliable free coverage found";
    body.innerHTML = `
      ${card("No reliable free coverage found", `
        <p>Brevi found the original article, but could not find separate open-web coverage that clearly matches this story.</p>
        <p class="ai-muted">No credit was used because Brevi did not generate a summary.</p>
        <div class="ai-actions">
          ${originalUrl ? `<a class="ai-button" href="${escapeAttribute(originalUrl)}" target="_blank" rel="noreferrer">Open original article</a>` : ""}
          <button type="button" class="ai-button ai-secondary" id="brevi-check-again">Try another search</button>
        </div>
      `, "ai-empty-card")}
      ${renderLockedArticle(state.lockedArticle, state.title)}
      ${renderCreditsProgress(state)}
      ${renderFooterActions(state)}
    `;
    attachCommonActions(state);
    return;
  }

  const isLowConfidence = state.matchConfidence === "low";
  const summaryHtml = isLowConfidence
    ? `<p>${escapeHtml(state.warning || "No reliable free coverage was found for the same story.")}</p>`
    : markdownBulletsToHtml(state.summaryBullets || state.summary || "No summary returned.");
  const warning = card("", `<p>${escapeHtml(TRUST_NOTE)}</p>`, "ai-note-card");
  const caution = state.warning && state.warning !== TRUST_NOTE
    ? `<div class="ai-caution">${escapeHtml(state.warning)}</div>`
    : "";
  const missingContext = card("Missing context", `<p>Brevi could not access the original paywalled article body, so details unique to that article may be missing.</p>`, "ai-context-card");
  const sourcesUsedCount = Array.isArray(state.sourcesUsed) ? state.sourcesUsed.length : 0;
  const bestMatchUrl = state.bestFreeMatch?.url || state.sourceUrl || "";
  const sourcesUsed = renderSourcesCard(state.sourcesUsed, bestMatchUrl);
  const readOriginal = renderReadOriginalCard(
    state.readOriginalRecommendation,
    state.lockedArticle,
    state.bestFreeMatch,
    state.sourceUrl
  );
  const originalUrl = state.lockedArticle?.url || "";

  body.innerHTML = `
    ${renderStoryStatusCard(state)}
    ${warning}
    ${caution}
    ${renderLockedArticle(state.lockedArticle, state.title)}
    ${renderBestMatch(state.bestFreeMatch, state.sourceTitle, state.sourceUrl)}
    ${renderKeyPointsCard(summaryHtml)}
    ${readOriginal}
    ${sourcesUsed}
    ${missingContext}
    ${renderCreditsProgress(state)}
    ${renderFooterActions(state, originalUrl)}
  `;

  attachCommonActions(state);
}

async function summarizeActiveTab(options = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new Error("No active tab found.");
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractArticleFromPage
  });

  await handlePaywallDetected(result.result || { title: tab.title, url: tab.url }, tab, options);
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
  const data = await chrome.storage.local.get(["backendUrl", "accountEmail", "installId", "supabaseSession"]);
  let installId = data.installId;
  if (!installId) {
    installId = crypto.randomUUID();
    await chrome.storage.local.set({ installId });
  }

  return {
    backendUrl: normalizeBackendUrl(data.backendUrl || DEFAULT_BACKEND_URL),
    accountEmail: data.accountEmail || "",
    installId,
    authSession: normalizeSupabaseSession(data.supabaseSession)
  };
}

function normalizeSupabaseSession(session) {
  if (!session || typeof session !== "object") return null;
  if (!session.access_token || !session.refresh_token) return null;
  return session;
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
