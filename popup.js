const backendUrl = document.getElementById("backendUrl");
const accountEmail = document.getElementById("accountEmail");
const autoRunEnabled = document.getElementById("autoRunEnabled");
const save = document.getElementById("save");
const summarize = document.getElementById("summarize");
const reset = document.getElementById("reset");
const status = document.getElementById("status");
const usage = document.getElementById("usage");
const creditPacks = document.getElementById("creditPacks");
const DEFAULT_BACKEND_URL = "https://brevi-psi.vercel.app";

chrome.storage.local.get(["backendUrl", "accountEmail", "autoRunEnabled", "installId"], async (data) => {
  backendUrl.value = data.backendUrl || DEFAULT_BACKEND_URL;
  accountEmail.value = data.accountEmail || "";
  autoRunEnabled.checked = data.autoRunEnabled !== false;
  await ensureInstallId(data.installId);
  checkUsage();
});

save.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "ARTICLE_INTEL_SAVE_SETTINGS",
    backendUrl: backendUrl.value,
    accountEmail: accountEmail.value,
    autoRunEnabled: autoRunEnabled.checked
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
  chrome.runtime.sendMessage({ type: "ARTICLE_INTEL_RESET_USAGE" }, (response) => {
    checkUsage();
    status.textContent = response?.ok ? "Usage reset." : "Usage reset is disabled.";
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
    const response = await fetch(`${url}/api/credits?installId=${encodeURIComponent(installId)}&email=${encodeURIComponent(email)}`);
    if (!response.ok) throw new Error("Backend unavailable");
    const data = await response.json();
    const free = data.free || data;
    usage.textContent = `Free summaries today: ${free.count} / ${free.limit}\nPaid credits: ${data.paid?.balance || 0}`;
    renderCreditPacks(data.packs || [], { url, installId, email }, free, data.paid || {});
  } catch (error) {
    usage.textContent = "Backend status: offline";
    creditPacks.innerHTML = "";
  }
}

function renderCreditPacks(packs, settings, free = {}, paid = {}) {
  creditPacks.innerHTML = "";
  if (Number(free.remaining || 0) <= 0 && Number(paid.balance || 0) <= 0) {
    const note = document.createElement("p");
    note.className = "credit-note";
    note.textContent = "Free summaries used. Choose a credit pack to continue.";
    creditPacks.appendChild(note);
  }

  for (const pack of packs.filter((item) => item.available)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pack-button";
    button.textContent = `${pack.name}: ${pack.credits} credits`;
    button.addEventListener("click", () => buyCredits(pack.id, settings));
    creditPacks.appendChild(button);
  }
}

async function buyCredits(pack, settings) {
  status.textContent = "Opening checkout...";
  const email = accountEmail.value.trim();
  await chrome.storage.local.set({ accountEmail: email });

  try {
    const response = await fetch(`${settings.url}/api/credits/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pack,
        installId: settings.installId,
        email
      })
    });
    const data = await response.json();
    if (!response.ok || !data.checkoutUrl) {
      throw new Error(data.message || "Could not create checkout.");
    }
    await chrome.tabs.create({ url: data.checkoutUrl });
    status.textContent = "";
  } catch (error) {
    status.textContent = error.message;
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
