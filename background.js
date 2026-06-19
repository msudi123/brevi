const DEFAULT_BACKEND_URL = "https://brevi-backend.vercel.app";

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
      accountEmail: message.accountEmail?.trim() || ""
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
    status: "success",
    title: article.title || result.title || "Brevi summary",
    summary: result.summary,
    sourceTitle: result.sourceTitle,
    sourceUrl: result.sourceUrl,
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
          <h2 id="brevi-title">Checking article</h2>
        </div>
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
    const lines = String(markdown)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const bullets = lines
      .map((line) => line.replace(/^[-*]\s*/, ""))
      .filter(Boolean);

    if (bullets.length <= 1) {
      return `<p>${formatInlineMarkdown(markdown)}</p>`;
    }

    return `<ul>${bullets.map((line) => `<li>${formatInlineMarkdown(line)}</li>`).join("")}</ul>`;
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

  const root = document.getElementById("brevi-root");
  if (!root) return;

  const title = root.querySelector("#brevi-title");
  const body = root.querySelector("#brevi-body");
  if (!title || !body) return;

  title.textContent = state.title || "Brevi";

  if (state.status === "loading") {
    body.innerHTML = `
      <div class="ai-loading">
        <span></span><span></span><span></span>
      </div>
      <p>Looking for free coverage and preparing a concise summary.</p>
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

  const summaryHtml = markdownBulletsToHtml(state.summary || "No summary returned.");
  const source = state.sourceUrl
    ? `<a class="ai-source" href="${escapeAttribute(state.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(state.sourceTitle || state.sourceUrl)}</a>`
    : `<span class="ai-source">${escapeHtml(state.sourceTitle || "Source not provided")}</span>`;

  body.innerHTML = `
    <div class="ai-source-wrap">
      <span>Free source</span>
      ${source}
    </div>
    <div class="ai-summary">${summaryHtml}</div>
    <p class="ai-muted">${Number.isFinite(state.remaining) ? `${state.remaining} free summaries left today.` : ""}</p>
  `;
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
