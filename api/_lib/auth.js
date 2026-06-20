import { hasSupabaseAuthConfig } from "./env.js";

export async function resolveSupabaseAuth(request, config) {
  if (!hasSupabaseAuthConfig(config)) {
    return {
      accessToken: "",
      userId: "",
      email: ""
    };
  }

  const authorization = getHeader(request, "authorization");
  const accessToken = extractBearerToken(authorization);
  if (!accessToken) {
    return {
      accessToken: "",
      userId: "",
      email: ""
    };
  }

  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: config.supabaseAnonKey,
        authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      return {
        accessToken: "",
        userId: "",
        email: ""
      };
    }

    const user = await response.json().catch(() => ({}));
    return {
      accessToken,
      userId: String(user?.id || "").trim(),
      email: String(user?.email || "").trim()
    };
  } catch (error) {
    return {
      accessToken: "",
      userId: "",
      email: ""
    };
  }
}

function extractBearerToken(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getHeader(request, name) {
  const headers = request.headers || {};
  if (typeof headers.get === "function") return headers.get(name);
  return headers[name] || headers[String(name || "").toLowerCase()];
}
