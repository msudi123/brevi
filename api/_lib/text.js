export function cleanText(value, maxLength = 1200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeUserId(value) {
  return String(value || "anonymous").trim().toLowerCase() || "anonymous";
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
