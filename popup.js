const backendUrl = document.getElementById("backendUrl");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const autoRunEnabled = document.getElementById("autoRunEnabled");
const save = document.getElementById("save");
const summarize = document.getElementById("summarize");
const reset = document.getElementById("reset");
const status = document.getElementById("status");
const usage = document.getElementById("usage");
const creditPacks = document.getElementById("creditPacks");
const signIn = document.getElementById("signIn");
const signUp = document.getElementById("signUp");
const signOut = document.getElementById("signOut");
const authStatus = document.getElementById("authStatus");
const authState = document.getElementById("authState");
const authUser = document.getElementById("authUser");
const creditsCompact = document.getElementById("creditsCompact");

const DEFAULT_BACKEND_URL = "https://brevi-psi.vercel.app";

const state = {
  backendUrl: DEFAULT_BACKEND_URL,
  supabaseUrl: "",
  supabaseAnonKey: "",
  installId: "",
  accountEmail: "",
  authSession: null,
  authUser: null
};

chrome.storage.local.get(["backendUrl", "accountEmail", "autoRunEnabled", "installId", "supabaseSession"], async (data) => {
  state.backendUrl = normalizeBackendUrl(data.backendUrl || DEFAULT_BACKEND_URL);
  state.accountEmail = data.accountEmail || "";
  backendUrl.value = state.backendUrl;
  authEmail.value = state.accountEmail;
  autoRunEnabled.checked = data.autoRunEnabled !== false;
  state.installId = await ensureInstallId(data.installId);
  await loadBackendInfo();
  await hydrateAuthSession(data.supabaseSession);
  updateAuthUI();
  checkUsage();
});

save.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "ARTICLE_INTEL_SAVE_SETTINGS",
    backendUrl: backendUrl.value,
    accountEmail: authEmail.value,
    autoRunEnabled: autoRunEnabled.checked
  }, () => {
    status.textContent = "Saved.";
    state.backendUrl = normalizeBackendUrl(backendUrl.value);
    state.accountEmail = authEmail.value.trim();
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

signIn.addEventListener("click", () => {
  authenticate("signin");
});

signUp.addEventListener("click", () => {
  authenticate("signup");
});

signOut.addEventListener("click", () => {
  signOutUser();
});

async function authenticate(mode) {
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    setAuthStatus("Enter your email and password.");
    return;
  }

  if (!state.supabaseUrl) {
    await loadBackendInfo();
  }

  if (!state.supabaseUrl) {
    setAuthStatus("Supabase auth is not configured yet.");
    return;
  }

  setAuthStatus(mode === "signup" ? "Creating account..." : "Signing in...");

  try {
    const session = mode === "signup"
      ? await supabaseSignUp(email, password)
      : await supabaseSignIn(email, password);

    if (session?.pendingConfirmation) {
      setAuthStatus("Check your email to confirm your account.");
      updateAuthUI();
      return;
    }

    await persistSession(session);
    authPassword.value = "";
    setAuthStatus(mode === "signup" ? "Account created." : "Signed in.");
    updateAuthUI();
    await checkUsage();
  } catch (error) {
    setAuthStatus(error.message || "Could not sign in.");
  }
}

async function signOutUser() {
  if (state.authSession?.access_token && state.supabaseUrl) {
    await fetch(`${state.supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: state.supabaseAnonKey || "",
        authorization: `Bearer ${state.authSession.access_token}`,
        "content-type": "application/json"
      }
    }).catch(() => {});
  }

  state.authSession = null;
  state.authUser = null;
  await chrome.storage.local.remove(["supabaseSession"]);
  updateAuthUI();
  setAuthStatus("Signed out.");
  checkUsage();
}

async function checkUsage() {
  const settings = await chrome.storage.local.get(["backendUrl", "accountEmail", "installId", "supabaseSession"]);
  state.backendUrl = normalizeBackendUrl(settings.backendUrl || DEFAULT_BACKEND_URL);
  state.accountEmail = state.authUser?.email || settings.accountEmail || "";
  const url = state.backendUrl;
  const installId = settings.installId || state.installId || await ensureInstallId(settings.installId);
  const session = normalizeSession(settings.supabaseSession) || state.authSession;
  const headers = session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {};

  try {
    const response = await fetch(`${url}/api/credits?installId=${encodeURIComponent(installId)}&email=${encodeURIComponent(state.accountEmail)}`, {
      headers
    });
    if (!response.ok) throw new Error("Backend unavailable");
    const data = await response.json();
    const free = data.free || data;
    const paidBalance = Number(data.paid?.balance || 0);
    usage.textContent = `Free summaries today: ${free.count} / ${free.limit}\nPaid credits: ${paidBalance}`;
    creditsCompact.textContent = paidBalance > 0 ? `${paidBalance} credits` : `${Number(free.remaining || 0)} free left`;
    renderCreditPacks(data.packs || [], { url, installId, email: state.accountEmail, headers }, free, data.paid || {});
  } catch (error) {
    usage.textContent = "Backend status: offline";
    creditsCompact.textContent = "--";
    creditPacks.innerHTML = "";
  }
}

function renderCreditPacks(packs, settings, free = {}, paid = {}) {
  creditPacks.innerHTML = "";
  const shouldShowPacks = Number(free.remaining || 0) <= 0 && Number(paid.balance || 0) <= 0;
  if (!shouldShowPacks) {
    return;
  }

  const note = document.createElement("p");
  note.className = "credit-note";
  note.textContent = "Free summaries used. Choose a credit pack to continue.";
  creditPacks.appendChild(note);

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
  const email = (state.authUser?.email || authEmail.value.trim() || settings.email || "").trim();
  await chrome.storage.local.set({ accountEmail: email });

  try {
    const response = await fetch(`${settings.url}/api/credits/checkout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(settings.headers || {})
      },
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

async function loadBackendInfo() {
  try {
    const response = await fetch(`${state.backendUrl}/api/health`);
    if (!response.ok) return null;
    const data = await response.json();
    state.supabaseUrl = data.supabaseUrl || "";
    state.supabaseAnonKey = data.supabaseAnonKey || "";
    return data;
  } catch (error) {
    return null;
  }
}

async function hydrateAuthSession(storedSession) {
  const session = normalizeSession(storedSession);
  if (!session) {
    state.authSession = null;
    state.authUser = null;
    return;
  }

  state.authSession = session;
  state.authUser = session.user || null;
  if (state.authUser?.email) {
    authEmail.value = state.authUser.email;
    state.accountEmail = state.authUser.email;
  }

  const shouldRefresh = Number(session.expires_at || 0) && Date.now() / 1000 >= Number(session.expires_at) - 60;
  if (shouldRefresh && state.supabaseUrl) {
    try {
      const refreshed = await supabaseRefreshSession(session.refresh_token);
      await persistSession(refreshed);
    } catch (error) {
      await chrome.storage.local.remove(["supabaseSession"]);
      state.authSession = null;
      state.authUser = null;
    }
  }
}

async function persistSession(session) {
  const normalized = normalizeSession(session);
  if (!normalized) {
    throw new Error("Supabase returned no session.");
  }

  state.authSession = normalized;
  state.authUser = normalized.user || null;
  if (state.authUser?.email) {
    state.accountEmail = state.authUser.email;
    authEmail.value = state.authUser.email;
    await chrome.storage.local.set({ accountEmail: state.authUser.email });
  }
  await chrome.storage.local.set({ supabaseSession: normalized });
  updateAuthUI();
}

function updateAuthUI() {
  const signedIn = Boolean(state.authSession?.access_token);
  authState.textContent = signedIn ? "Signed in" : "Signed out";
  authState.className = signedIn ? "badge badge-mint" : "badge badge-neutral";
  authUser.textContent = state.authUser?.email || state.accountEmail || "";
  signOut.classList.toggle("hidden", !signedIn);
}

function setAuthStatus(text) {
  authStatus.textContent = text || "";
}

async function supabaseSignIn(email, password) {
  if (!state.supabaseUrl) throw new Error("Supabase auth is not configured.");
  const response = await fetch(`${state.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: await getSupabaseAnonKey(),
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  return readSupabaseSession(response);
}

async function supabaseSignUp(email, password) {
  if (!state.supabaseUrl) throw new Error("Supabase auth is not configured.");
  const response = await fetch(`${state.supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: await getSupabaseAnonKey(),
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.msg || data.error_description || data.message || "Could not create account.");
  }
  if (data.session?.access_token && data.session?.refresh_token) {
    return data.session;
  }
  if (data.user) {
    return { pendingConfirmation: true, user: data.user };
  }
  throw new Error("Supabase did not return a session.");
}

async function supabaseRefreshSession(refreshToken) {
  if (!state.supabaseUrl) throw new Error("Supabase auth is not configured.");
  const response = await fetch(`${state.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: await getSupabaseAnonKey(),
      "content-type": "application/json"
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  return readSupabaseSession(response);
}

async function readSupabaseSession(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.msg || data.error_description || data.message || "Could not sign in.");
  }

  const session = data.session || data;
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error("Supabase did not return a session.");
  }
  return session;
}

function normalizeSession(session) {
  if (!session || typeof session !== "object") return null;
  if (!session.access_token || !session.refresh_token) return null;
  return session;
}

async function getSupabaseAnonKey() {
  if (state.supabaseAnonKey) return state.supabaseAnonKey;
  const response = await fetch(`${state.backendUrl}/api/health`);
  if (!response.ok) throw new Error("Backend unavailable.");
  const data = await response.json();
  state.supabaseUrl = data.supabaseUrl || state.supabaseUrl;
  state.supabaseAnonKey = data.supabaseAnonKey || "";
  if (!state.supabaseAnonKey) {
    throw new Error("Supabase auth is not configured.");
  }
  return state.supabaseAnonKey;
}

function normalizeBackendUrl(value) {
  return String(value || DEFAULT_BACKEND_URL).trim().replace(/\/+$/, "");
}
