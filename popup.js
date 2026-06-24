const authEmail = document.getElementById("authEmail");
const otpCode = document.getElementById("otpCode");
const autoRunEnabled = document.getElementById("autoRunEnabled");
const summarize = document.getElementById("summarize");
const status = document.getElementById("status");
const creditPacks = document.getElementById("creditPacks");
const buyCredits = document.getElementById("buyCredits");
const actionHint = document.getElementById("actionHint");
const usageState = document.getElementById("usageState");
const freeUsageCount = document.getElementById("freeUsageCount");
const freeUsageProgress = document.getElementById("freeUsageProgress");
const paidCreditsCount = document.getElementById("paidCreditsCount");
const authCard = document.getElementById("authCard");
const emailStep = document.getElementById("emailStep");
const codeStep = document.getElementById("codeStep");
const signedInView = document.getElementById("signedInView");
const signedInEmail = document.getElementById("signedInEmail");
const sendCode = document.getElementById("sendCode");
const verifyCode = document.getElementById("verifyCode");
const resendCode = document.getElementById("resendCode");
const changeEmail = document.getElementById("changeEmail");
const signOut = document.getElementById("signOut");

const DEFAULT_BACKEND_URL = "https://www.getbrevi.dev";
const FALLBACK_BACKEND_URL = "https://brevi-psi.vercel.app";

const state = {
  mode: "loading",
  backendUrl: DEFAULT_BACKEND_URL,
  supabaseUrl: "",
  supabaseAnonKey: "",
  installId: "",
  pendingEmail: "",
  session: null,
  user: null,
  packs: [],
  settings: null,
  storedSession: null,
  restoringSession: null
};

init().catch((error) => {
  showSignedOutEmail();
  setStatus(error.message || "Could not load Brevi.");
});

sendCode.addEventListener("click", () => sendOtp());
verifyCode.addEventListener("click", () => verifyOtp());
resendCode.addEventListener("click", () => sendOtp({ resend: true }));
changeEmail.addEventListener("click", () => showSignedOutEmail());
signOut.addEventListener("click", () => signOutUser());

autoRunEnabled.addEventListener("change", () => {
  trackEvent("auto_run_toggle", { enabled: autoRunEnabled.checked ? "true" : "false" });
  chrome.runtime.sendMessage({
    type: "ARTICLE_INTEL_SAVE_SETTINGS",
    accountEmail: state.user?.email || "",
    autoRunEnabled: autoRunEnabled.checked
  }, () => {
    setStatus(autoRunEnabled.checked ? "Auto-run enabled." : "Auto-run disabled.");
  });
});

summarize.addEventListener("click", () => {
  trackEvent("summarize_click");
  if (!state.session?.access_token) {
    showSignedOutEmail();
    setStatus("Sign in to generate briefs.");
    trackEvent("summarize_blocked", { reason: "signed_out" });
    return;
  }

  status.textContent = "Summarizing current page...";
  chrome.runtime.sendMessage({ type: "BREVI_MANUAL_SUMMARIZE" }, (response) => {
    if (response?.ok) {
      status.textContent = "Summary started.";
      trackEvent("summarize_started");
      checkUsage();
    } else {
      status.textContent = response?.message || "Could not summarize this page.";
      trackEvent("summarize_failed");
    }
    clearStatusLater();
  });
});

buyCredits.addEventListener("click", () => {
  trackEvent("buy_credits_click");
  openCreditPacks();
});

async function init() {
  showLoading("Loading account...");
  const stored = await chrome.storage.local.get([
    "autoRunEnabled",
    "installId",
    "supabaseSession",
    "supabase_access_token",
    "supabase_refresh_token",
    "user_id",
    "user_email"
  ]);

  state.backendUrl = DEFAULT_BACKEND_URL;
  await chrome.storage.local.remove(["backendUrl"]);
  autoRunEnabled.checked = stored.autoRunEnabled !== false;
  state.installId = await ensureInstallId(stored.installId);
  await loadSupabaseConfig();

  const restoredSession = normalizeStoredSession(stored);
  state.storedSession = restoredSession;
  if (restoredSession) {
    await restoreSession(restoredSession);
  } else {
    showSignedOutEmail();
  }
}

async function loadSupabaseConfig() {
  const { backendUrl, data } = await fetchBackendHealth();
  state.backendUrl = backendUrl;
  await chrome.storage.local.set({ systemBackendUrl: backendUrl });
  state.supabaseUrl = String(data.supabaseUrl || "").replace(/\/+$/, "");
  state.supabaseAnonKey = String(data.supabaseAnonKey || "");
  if (!state.supabaseUrl || !state.supabaseAnonKey) {
    throw new Error("Supabase Auth is not configured.");
  }
}

async function fetchBackendHealth() {
  const urls = [DEFAULT_BACKEND_URL, FALLBACK_BACKEND_URL];
  let lastError = null;

  for (const backendUrl of urls) {
    try {
      const response = await fetch(`${backendUrl}/api/health`);
      if (!response.ok) {
        lastError = new Error("Brevi backend is unavailable.");
        continue;
      }
      return {
        backendUrl: backendOriginFromResponse(response, backendUrl),
        data: await response.json()
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Brevi backend is unavailable.");
}

async function restoreSession(session) {
  if (state.restoringSession) return state.restoringSession;
  state.restoringSession = restoreSessionInner(session).finally(() => {
    state.restoringSession = null;
  });
  return state.restoringSession;
}

async function restoreSessionInner(session) {
  try {
    setMode("loading");
    let nextSession = session;
    if (isExpiredOrExpiring(session)) {
      nextSession = await refreshSession(session.refresh_token);
    }

    const user = nextSession.user || session.user || await getCurrentUser(nextSession.access_token);
    if (!user?.id || !user?.email) {
      throw new Error("Stored session is no longer valid.");
    }

    state.session = { ...nextSession, user };
    state.user = user;
    await persistSession(state.session);
    showSignedIn();
    await checkUsage();
  } catch (error) {
    await clearAuthStorage();
    showSignedOutEmail();
    setStatus("Sign in to continue.");
  }
}

async function sendOtp(options = {}) {
  const email = normalizeEmail(authEmail.value || state.pendingEmail);
  if (!email) {
    setStatus("Enter your email.");
    trackEvent("sign_in_code_blocked", { reason: "missing_email" });
    return;
  }

  try {
    trackEvent(options.resend ? "sign_in_code_resend" : "sign_in_code_send");
    setAuthBusy(true, options.resend ? "Sending again..." : "Sending code...");
    await loadSupabaseConfig();
    const response = await fetch(`${state.supabaseUrl}/auth/v1/otp`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        email,
        create_user: true
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.msg || data.error_description || data.message || "Could not send sign-in code.");
    }

    state.pendingEmail = email;
    authEmail.value = email;
    otpCode.value = "";
    showCodeSent();
    setStatus(options.resend ? "Code sent again." : "Code sent.");
    trackEvent(options.resend ? "sign_in_code_resent" : "sign_in_code_sent");
  } catch (error) {
    setStatus(error.message || "Could not send sign-in code.");
    trackEvent("sign_in_code_failed");
  } finally {
    setAuthBusy(false);
  }
}

async function verifyOtp() {
  const email = normalizeEmail(state.pendingEmail || authEmail.value);
  const token = String(otpCode.value || "").trim();
  if (!email || token.length < 6) {
    setStatus("Enter the 6-digit code.");
    trackEvent("sign_in_verify_blocked", { reason: "missing_code" });
    return;
  }

  try {
    trackEvent("sign_in_verify");
    setAuthBusy(true, "Verifying...");
    const response = await fetch(`${state.supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        email,
        token,
        type: "email"
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token || !data.refresh_token) {
      throw new Error("Invalid or expired code. Try again.");
    }

    const user = data.user || await getCurrentUser(data.access_token);
    if (!user?.id || !user?.email) {
      throw new Error("Could not load your Brevi account. Try signing in again.");
    }
    const session = normalizeSupabaseSession({ ...data, user });
    state.user = user;
    state.session = { ...session, user };
    await persistSession(state.session);
    showSignedIn();
    setStatus("Signed in.");
    trackEvent("sign_in_success");
    await checkUsage();
  } catch (error) {
    setStatus(error.message || "Invalid or expired code. Try again.");
    trackEvent("sign_in_failed");
  } finally {
    setAuthBusy(false);
  }
}

async function signOutUser() {
  trackEvent("sign_out");
  try {
    if (state.session?.access_token) {
      await fetch(`${state.supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: state.supabaseAnonKey,
          authorization: `Bearer ${state.session.access_token}`,
          "content-type": "application/json"
        }
      }).catch(() => {});
    }
  } finally {
    state.session = null;
    state.user = null;
    await clearAuthStorage();
    showSignedOutEmail();
    setStatus("Signed out.");
  }
}

async function checkUsage(options = {}) {
  if (!(await ensureAuthenticatedSession())) {
    return;
  }

  try {
    const response = await fetch(`${state.backendUrl}/api/credits?installId=${encodeURIComponent(state.installId)}&email=${encodeURIComponent(state.user.email)}`, {
      headers: state.settings.headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Backend unavailable");
    state.packs = data.packs || [];
    renderUsage(data.free || data, data.paid || {});
    renderCreditPacks(state.packs, state.settings, Boolean(options.showPacks));
  } catch (error) {
    usageState.textContent = "Offline";
    freeUsageCount.textContent = "-- / -- left";
    paidCreditsCount.textContent = "-- credits";
    freeUsageProgress.style.width = "0%";
    freeUsageProgress.className = "progress-fill progress-empty";
    actionHint.textContent = "Brevi could not reach the backend.";
    summarize.disabled = true;
    summarize.classList.add("is-disabled");
    creditPacks.innerHTML = "";
  }
}

async function openCreditPacks() {
  if (state.mode === "loading") {
    setStatus("Loading your Brevi account...");
    trackEvent("credit_packs_blocked", { reason: "loading" });
    return;
  }

  if (!(await ensureAuthenticatedSession())) {
    setStatus("Sign in to buy credits.");
    trackEvent("credit_packs_blocked", { reason: "signed_out" });
    return;
  }

  if (!state.settings || state.packs.length === 0) {
    setStatus("Checking credit packs...");
    await checkUsage({ showPacks: true });
  } else {
    renderCreditPacks(state.packs, state.settings, true);
  }

  if (state.packs.some((pack) => pack.available)) {
    creditPacks.classList.add("is-open");
    setStatus("Choose a credit pack.");
    trackEvent("credit_packs_opened");
  } else {
    setStatus("Credit packs are not configured yet.");
    trackEvent("credit_packs_unavailable");
  }
}

function renderUsage(free = {}, paid = {}) {
  const limit = Number(free.limit || 0);
  const remaining = Number.isFinite(Number(free.remaining))
    ? Number(free.remaining)
    : Math.max(limit - Number(free.count || 0), 0);
  const paidBalance = Number(paid.balance || 0);
  const percent = limit > 0 ? Math.max(0, Math.min(100, Math.round((remaining / limit) * 100))) : 0;
  const hasSummaries = remaining > 0 || paidBalance > 0;
  const isLow = remaining > 0 && percent <= 20;
  const isZero = remaining <= 0;

  usageState.textContent = hasSummaries ? "Ready" : "Credits needed";
  freeUsageCount.textContent = `${remaining} / ${limit || 5} left`;
  paidCreditsCount.textContent = `${paidBalance} ${paidBalance === 1 ? "credit" : "credits"}`;
  freeUsageProgress.style.width = `${percent}%`;
  freeUsageProgress.className = `progress-fill ${isZero ? "progress-empty" : isLow ? "progress-low" : "progress-normal"}`;

  summarize.disabled = !hasSummaries;
  summarize.classList.toggle("is-disabled", !hasSummaries);
  actionHint.textContent = hasSummaries
    ? "Generate a brief for the page you are viewing."
    : "No summaries left. Buy credits to continue.";
}

function renderCreditPacks(packs, settings, showPacks = false) {
  creditPacks.innerHTML = "";
  creditPacks.classList.toggle("is-open", showPacks);

  const availablePacks = packs.filter((item) => item.available);
  if (availablePacks.length === 0) return;

  const note = document.createElement("p");
  note.className = "credit-note";
  note.textContent = "Choose a credit pack.";
  creditPacks.appendChild(note);

  for (const pack of availablePacks) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pack-button";
    button.textContent = `${pack.name}: ${pack.credits} credits`;
    button.addEventListener("click", () => buyCreditPack(pack.id));
    creditPacks.appendChild(button);
  }
}

async function buyCreditPack(pack) {
  if (!(await ensureAuthenticatedSession())) {
    setStatus("Sign in to buy credits.");
    trackEvent("checkout_blocked", { reason: "signed_out" });
    return;
  }

  status.textContent = "Opening checkout...";
  trackEvent("checkout_start", { pack });
  try {
    const response = await fetch(`${state.backendUrl}/api/credits/checkout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${state.session.access_token}`
      },
      body: JSON.stringify({
        pack,
        installId: state.installId
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.checkoutUrl) {
      throw new Error(data.message || "Could not create checkout.");
    }
    await chrome.tabs.create({ url: data.checkoutUrl });
    status.textContent = "";
    trackEvent("checkout_opened", { pack });
  } catch (error) {
    status.textContent = error.message;
    trackEvent("checkout_failed", { pack });
  }
}

async function ensureAuthenticatedSession() {
  if (!state.session?.access_token && state.storedSession) {
    await restoreSession(state.storedSession);
  } else if (
    state.session?.access_token
    && isExpiredOrExpiring(state.session)
    && state.session.refresh_token
  ) {
    try {
      const refreshed = await refreshSession(state.session.refresh_token);
      const user = refreshed.user || state.user || await getCurrentUser(refreshed.access_token);
      if (!user?.id || !user?.email) {
        throw new Error("Session refresh failed.");
      }
      state.session = { ...refreshed, user };
      state.user = user;
      await persistSession(state.session);
      showSignedIn();
    } catch {
      await clearAuthStorage();
      showSignedOutEmail();
      return false;
    }
  }

  if (!state.session?.access_token || !state.user?.email) {
    showSignedOutEmail();
    return false;
  }

  state.settings = {
    url: state.backendUrl,
    installId: state.installId,
    email: state.user.email,
    headers: { authorization: `Bearer ${state.session.access_token}` }
  };
  return true;
}

async function refreshSession(refreshToken) {
  const response = await fetch(`${state.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new Error("Session refresh failed.");
  }
  return normalizeSupabaseSession(data);
}

async function getCurrentUser(accessToken) {
  const response = await fetch(`${state.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: state.supabaseAnonKey,
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  if (!user?.id || !user?.email) return null;
  return {
    id: String(user.id),
    email: String(user.email)
  };
}

async function persistSession(session) {
  const normalized = normalizeSupabaseSession(session);
  const user = normalized.user || session.user || state.user;
  if (!normalized?.access_token || !normalized?.refresh_token || !user?.id || !user?.email) {
    throw new Error("Supabase returned an incomplete session.");
  }

  const sessionWithUser = {
    ...normalized,
    user: {
      id: String(user.id),
      email: String(user.email)
    }
  };

  await chrome.storage.local.set({
    supabaseSession: sessionWithUser,
    supabase_access_token: sessionWithUser.access_token,
    supabase_refresh_token: sessionWithUser.refresh_token,
    supabase_expires_at: sessionWithUser.expires_at || "",
    user_id: sessionWithUser.user.id,
    user_email: sessionWithUser.user.email,
    accountEmail: sessionWithUser.user.email
  });
}

async function clearAuthStorage() {
  await chrome.storage.local.remove([
    "supabaseSession",
    "supabase_access_token",
    "supabase_refresh_token",
    "supabase_expires_at",
    "user_id",
    "user_email",
    "accountEmail"
  ]);
}

function normalizeStoredSession(stored) {
  if (stored.supabaseSession?.access_token && stored.supabaseSession?.refresh_token) {
    return normalizeSupabaseSession(stored.supabaseSession);
  }
  if (stored.supabase_access_token && stored.supabase_refresh_token) {
    return normalizeSupabaseSession({
      access_token: stored.supabase_access_token,
      refresh_token: stored.supabase_refresh_token,
      expires_at: stored.supabase_expires_at,
      user: stored.user_id && stored.user_email ? {
        id: stored.user_id,
        email: stored.user_email
      } : null
    });
  }
  return null;
}

function normalizeSupabaseSession(session) {
  if (!session || typeof session !== "object") return null;
  if (!session.access_token || !session.refresh_token) return null;
  const expiresAt = Number(session.expires_at || 0)
    || (session.expires_in ? Math.floor(Date.now() / 1000) + Number(session.expires_in) : 0);
  return {
    ...session,
    expires_at: expiresAt || undefined
  };
}

function isExpiredOrExpiring(session) {
  return Number(session?.expires_at || 0) > 0 && Date.now() / 1000 >= Number(session.expires_at) - 60;
}

function showLoading(message) {
  setMode("loading");
  authCard.classList.remove("hidden");
  signedInView.classList.add("hidden");
  emailStep.classList.remove("hidden");
  codeStep.classList.add("hidden");
  setAuthBusy(true, message);
}

function showSignedOutEmail() {
  setMode("signed_out");
  authCard.classList.remove("hidden");
  signedInView.classList.add("hidden");
  emailStep.classList.remove("hidden");
  codeStep.classList.add("hidden");
  setAuthBusy(false);
}

function showCodeSent() {
  setMode("signed_out");
  authCard.classList.remove("hidden");
  signedInView.classList.add("hidden");
  emailStep.classList.add("hidden");
  codeStep.classList.remove("hidden");
  otpCode.focus();
}

function showSignedIn() {
  setMode("signed_in");
  authCard.classList.add("hidden");
  signedInView.classList.remove("hidden");
  signedInEmail.textContent = state.user?.email || "";
  setAuthBusy(false);
}

function setAuthBusy(isBusy, message = "") {
  sendCode.disabled = isBusy;
  verifyCode.disabled = isBusy;
  resendCode.disabled = isBusy;
  changeEmail.disabled = isBusy;
  if (message) status.textContent = message;
}

function setMode(mode) {
  state.mode = mode;
  const loading = mode === "loading";
  const signedIn = mode === "signed_in";
  buyCredits.disabled = loading || !signedIn;
  buyCredits.classList.toggle("is-disabled", loading || !signedIn);
  summarize.disabled = loading || !signedIn;
  summarize.classList.toggle("is-disabled", loading || !signedIn);
}

function supabaseHeaders() {
  return {
    apikey: state.supabaseAnonKey,
    "content-type": "application/json"
  };
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

function backendOriginFromResponse(response, fallbackUrl) {
  try {
    return normalizeBackendUrl(new URL(response.url || fallbackUrl).origin);
  } catch (error) {
    return normalizeBackendUrl(fallbackUrl);
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function setStatus(message) {
  status.textContent = message;
  clearStatusLater();
}

function trackEvent(name, params = {}) {
  window.breviAnalytics?.trackEvent(name, params);
}

function clearStatusLater() {
  setTimeout(() => {
    status.textContent = "";
  }, 2200);
}
