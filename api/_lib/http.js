export function sendJson(response, statusCode, payload, config) {
  sendCors(response, config);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

export function sendHtml(response, statusCode, html, config) {
  sendCors(response, config);
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8"
  });
  response.end(html);
}

export function sendCors(response, config) {
  response.setHeader("access-control-allow-origin", config?.extensionOrigin || "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "authorization, content-type, x-client-info, apikey, x-signature, x-brevi-auth-token");
}

export async function readJsonBody(request) {
  const raw = await readRawBody(request);
  if (!raw) return {};
  return JSON.parse(raw);
}

export async function readRawBody(request) {
  if (request.body && typeof request.body === "object" && !isReadableStream(request.body)) {
    return JSON.stringify(request.body);
  }

  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 100000) {
      throw new Error("Request body too large.");
    }
  }

  return raw;
}

export function getRequestUrl(request) {
  return new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
}

function isReadableStream(value) {
  return value && typeof value.getReader === "function";
}
