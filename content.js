const PAYWALL_SELECTORS = [
  ".paywall",
  ".subscription-wall",
  ".subscribe-wall",
  ".meter-wall",
  ".meteredContent",
  ".regwall",
  ".premium-content",
  "[class*='paywall' i]",
  "[class*='subscription-wall' i]",
  "[class*='meter-wall' i]",
  "[id*='paywall' i]",
  "[id*='subscription-wall' i]",
  "[data-testid*='paywall' i]"
];

const PAYWALL_TEXT_PATTERNS = [
  /subscribe to continue/i,
  /subscription required/i,
  /this article is for subscribers/i,
  /already a subscriber/i,
  /to continue reading/i,
  /continue reading with a subscription/i,
  /sign in to continue reading/i,
  /create a free account or subscribe/i,
  /you have reached your article limit/i,
  /you've reached your article limit/i,
  /support our journalism/i,
  /unlock this article/i
];

let lastDetectedUrl = "";
let scanTimer = null;

scanForPaywall();

const observer = new MutationObserver(() => {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scanForPaywall, 700);
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

async function scanForPaywall() {
  if (location.href === lastDetectedUrl) return;

  const settings = await chrome.storage.local.get(["autoRunEnabled"]);
  if (settings.autoRunEnabled === false) return;

  const selectorHit = PAYWALL_SELECTORS.some((selector) => document.querySelector(selector));
  const text = getVisiblePageText();
  const textHit = PAYWALL_TEXT_PATTERNS.some((pattern) => pattern.test(text));

  if (!selectorHit && !textHit) return;

  lastDetectedUrl = location.href;
  chrome.runtime.sendMessage({
    type: "BREVI_PAYWALL_DETECTED",
    payload: {
      title: extractTitle(),
      url: location.href
    }
  });
}

function extractTitle() {
  const ogTitle = document.querySelector("meta[property='og:title']")?.content;
  const twitterTitle = document.querySelector("meta[name='twitter:title']")?.content;
  const headline = document.querySelector("h1")?.innerText;
  return cleanText(ogTitle || twitterTitle || headline || document.title || "Untitled article");
}

function getVisiblePageText() {
  const candidates = [
    document.body?.innerText || "",
    ...Array.from(document.querySelectorAll("dialog, [role='dialog'], aside, section, div"))
      .slice(0, 250)
      .map((node) => node.innerText || "")
  ];

  return candidates
    .join("\n")
    .replace(/\s+/g, " ")
    .slice(0, 25000);
}

function cleanText(value) {
  return String(value).replace(/\s+/g, " ").trim();
}
