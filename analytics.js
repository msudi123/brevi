const BREVI_GA_MEASUREMENT_ID = "G-C7KV5GVSWT";
const BREVI_GA_ENDPOINT = "https://www.google-analytics.com/g/collect";
const BREVI_GA_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

window.dataLayer = window.dataLayer || [];

window.gtag = function gtag() {
  window.dataLayer.push(arguments);
  const [command, eventName, params] = arguments;
  if (command === "event" && eventName) {
    window.breviAnalytics?.trackEvent(eventName, params || {});
  }
  if (command === "config" && eventName === BREVI_GA_MEASUREMENT_ID && params?.send_page_view !== false) {
    window.breviAnalytics?.trackEvent("page_view", {
      page_title: params?.page_title || document.title || "Brevi",
      page_location: params?.page_location || "chrome-extension://popup"
    });
  }
};

window.breviAnalytics = {
  trackEvent
};

gtag("js", new Date());
gtag("config", BREVI_GA_MEASUREMENT_ID, {
  page_title: document.title || "Brevi",
  page_location: "chrome-extension://popup"
});

async function trackEvent(name, params = {}) {
  try {
    const eventName = normalizeEventName(name);
    if (!eventName) return;

    const state = await getAnalyticsState();
    const query = new URLSearchParams({
      v: "2",
      tid: BREVI_GA_MEASUREMENT_ID,
      cid: state.clientId,
      sid: String(state.sessionId),
      sct: String(state.sessionCount),
      en: eventName,
      dl: String(params.page_location || "chrome-extension://popup"),
      dt: String(params.page_title || document.title || "Brevi"),
      ul: navigator.language || "en"
    });

    const manifest = chrome.runtime.getManifest();
    query.set("ep.extension_version", manifest.version || "");
    query.set("ep.extension_name", manifest.short_name || "Brevi");

    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || key === "page_location" || key === "page_title") continue;
      query.set(`ep.${normalizeParamName(key)}`, String(value).slice(0, 100));
    }

    await fetch(`${BREVI_GA_ENDPOINT}?${query.toString()}`, {
      method: "POST",
      mode: "no-cors",
      keepalive: true
    });
  } catch {
    // Analytics should never affect the extension experience.
  }
}

async function getAnalyticsState() {
  const now = Date.now();
  const stored = await chrome.storage.local.get([
    "gaClientId",
    "gaSessionId",
    "gaSessionCount",
    "gaLastEventAt"
  ]);

  const clientId = stored.gaClientId || crypto.randomUUID();
  const previousSessionId = Number(stored.gaSessionId || 0);
  const previousCount = Number(stored.gaSessionCount || 0);
  const lastEventAt = Number(stored.gaLastEventAt || 0);
  const expired = !previousSessionId || !lastEventAt || now - lastEventAt > BREVI_GA_SESSION_TIMEOUT_MS;
  const sessionId = expired ? Math.floor(now / 1000) : previousSessionId;
  const sessionCount = expired ? previousCount + 1 : Math.max(previousCount, 1);

  await chrome.storage.local.set({
    gaClientId: clientId,
    gaSessionId: sessionId,
    gaSessionCount: sessionCount,
    gaLastEventAt: now
  });

  return { clientId, sessionId, sessionCount };
}

function normalizeEventName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function normalizeParamName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
