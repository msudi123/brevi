const backendUrl = document.getElementById("backendUrl");
const accountEmail = document.getElementById("accountEmail");
const save = document.getElementById("save");
const summarize = document.getElementById("summarize");
const reset = document.getElementById("reset");
const status = document.getElementById("status");
const usage = document.getElementById("usage");
const DEFAULT_BACKEND_URL = "https://brevi-psi.vercel.app";

chrome.storage.local.get(["backendUrl", "accountEmail", "installId"], async (data) => {
  backendUrl.value = data.backendUrl || DEFAULT_BACKEND_URL;
  accountEmail.value = data.accountEmail || "";
  await ensureInstallId(data.installId);
  checkUsage();
});

save.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "ARTICLE_INTEL_SAVE_SETTINGS",
    backendUrl: backendUrl.value,
    accountEmail: accountEmail.value
  }, () => {
    status.textContent = "Saved.";
    checkUsage();
    setTimeout(() => {
      status.textContent = "";
    }, 1600);
  });
});

summarize.addEventListener("click", () => {
  status.textContent = "Summarizing current page...";
  chrome.runtime.sendMessage({ type: "BREVI_MANUAL_SUMMARIZE" }, (response) => {
    if (response?.ok) {
      status.textContent = "Summary started.";
      checkUsage();
    } else {
      status.textContent = response?.message || "Could not summarize this page.";
    }
    setTimeout(() => {
      status.textContent = "";
    }, 2200);
  });
});

reset.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "ARTICLE_INTEL_RESET_USAGE" }, () => {
    checkUsage();
    status.textContent = "Usage reset.";
    setTimeout(() => {
      status.textContent = "";
    }, 1600);
  });
});

async function checkUsage() {
  const settings = await chrome.storage.local.get(["backendUrl", "accountEmail", "installId"]);
  const url = normalizeBackendUrl(settings.backendUrl || DEFAULT_BACKEND_URL);
  const installId = settings.installId || await ensureInstallId(settings.installId);
  const email = settings.accountEmail || "";

  try {
    const response = await fetch(`${url}/api/usage?installId=${encodeURIComponent(installId)}&email=${encodeURIComponent(email)}`);
    if (!response.ok) throw new Error("Backend unavailable");
    const data = await response.json();
    usage.textContent = `Free summaries today: ${data.count} / ${data.limit}`;
  } catch (error) {
    usage.textContent = "Backend status: offline";
  }
}

async function ensureInstallId(installId) {
  if (installId) return installId;
  const nextInstallId = crypto.randomUUID();
  await chrome.storage.local.set({ installId: nextInstallId });
  return nextInstallId;
}

function normalizeBackendUrl(value) {
  return String(value || DEFAULT_BACKEND_URL).trim().replace(/\/+$/, "");
}
