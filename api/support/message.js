import { handleSupportMessage } from "../_lib/handlers.js";
import { loadLocalEnv } from "../_lib/env.js";
import { sendCors } from "../_lib/http.js";

loadLocalEnv();

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    sendCors(response);
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.statusCode = 405;
    response.end("Method not allowed");
    return;
  }

  await handleSupportMessage(request, response);
}
