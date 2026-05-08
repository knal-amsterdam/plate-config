import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getEmailConfigurationError, isUserInputError, sendQuoteRequestEmails } from "./js/quote-email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
await loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const NODE_ENV = process.env.NODE_ENV || "development";
const DEFAULT_QUOTE_TO_EMAIL = NODE_ENV === "production"
  ? "Info@thecarvecompany.com"
  : "Ideas@knalamsterdam.com";
const QUOTE_TO_EMAIL = process.env.QUOTE_TO_EMAIL || DEFAULT_QUOTE_TO_EMAIL;
const LOCAL_QUOTE_TO_EMAIL = process.env.LOCAL_QUOTE_TO_EMAIL || "Ideas@knalamsterdam.com";
const QUOTE_FROM_EMAIL = process.env.QUOTE_FROM_EMAIL || "request@knalamsterdam.com";
const REPLY_TO_EMAIL = process.env.QUOTE_REPLY_TO_EMAIL || QUOTE_TO_EMAIL;

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".glb", "model/gltf-binary"],
  [".exr", "image/aces"],
]);

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/request-quote") {
      await handleQuoteRequest(request, response, { quoteToEmail: QUOTE_TO_EMAIL });
      return;
    }

    if (request.method === "POST" && request.url === "/api/request-quote-local") {
      await handleQuoteRequest(request, response, { quoteToEmail: LOCAL_QUOTE_TO_EMAIL });
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStaticFile(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "The server could not complete the request." });
  }
});

server.listen(PORT, () => {
  console.log(`Plate configurator server listening on http://localhost:${PORT}`);
});

async function handleQuoteRequest(request, response, { quoteToEmail }) {
  try {
    const configError = getEmailConfigurationError({
      resendApiKey: RESEND_API_KEY,
      quoteToEmail,
      quoteFromEmail: QUOTE_FROM_EMAIL,
      replyToEmail: REPLY_TO_EMAIL,
    });

    if (configError) {
      sendJson(response, 500, { error: configError });
      return;
    }

    const payload = await readJsonBody(request);

    await sendQuoteRequestEmails({
      payload,
      resendApiKey: RESEND_API_KEY,
      quoteToEmail,
      quoteFromEmail: QUOTE_FROM_EMAIL,
      replyToEmail: REPLY_TO_EMAIL,
      nodeEnv: NODE_ENV,
    });

    sendJson(response, 200, {
      ok: true,
      message: "Quote request sent successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The quote request could not be processed.";
    const statusCode = isUserInputError(error) ? 400 : 502;
    console.error("Quote request failed:", error);
    sendJson(response, statusCode, { error: message });
  }
}

async function serveStaticFile(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const relativePath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname) || !existsSync(filePath)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES.get(extension) || "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function loadEnvFile(filePath) {
  try {
    const content = await readFile(filePath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}
