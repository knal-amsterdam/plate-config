import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSheetLayoutDxfs } from "./js/dxf.js";
import { calculatePlatePricing, formatEuro, getMaterialByKey, SHEET_LAYOUT_GAP_MM, SHEET_LAYOUT_MARGIN_MM, STOCK_SHEET_LENGTH_MM, STOCK_SHEET_WIDTH_MM } from "./js/pricing.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
await loadEnvFile(path.join(__dirname, ".env"));
const PORT = Number(process.env.PORT || 3000);
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const QUOTE_TO_EMAIL = process.env.QUOTE_TO_EMAIL || "ideas@knalamsterdam.com";
const PRIMARY_QUOTE_RECIPIENT = QUOTE_TO_EMAIL;
const SECONDARY_QUOTE_RECIPIENT = "Info@thecarvecompany.com";
const QUOTE_FROM_EMAIL = process.env.QUOTE_FROM_EMAIL || "";
const REPLY_TO_EMAIL = process.env.QUOTE_REPLY_TO_EMAIL || QUOTE_TO_EMAIL;
const NODE_ENV = process.env.NODE_ENV || "development";

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
      await handleQuoteRequest(request, response);
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

async function handleQuoteRequest(request, response) {
  try {
    const configError = getEmailConfigurationError();

    if (configError) {
      sendJson(response, 500, {
        error: configError,
      });
      return;
    }

    const payload = await readJsonBody(request);
    const normalized = normalizeQuotePayload(payload);
    const internalMessage = buildInternalEmail(normalized);
    const confirmationMessage = buildConfirmationEmail(normalized);
    const sheetLayoutAttachments = createSheetLayoutDxfs(normalized.items, {
      sheetLengthMm: STOCK_SHEET_LENGTH_MM,
      sheetWidthMm: STOCK_SHEET_WIDTH_MM,
      marginMm: SHEET_LAYOUT_MARGIN_MM,
      gapMm: SHEET_LAYOUT_GAP_MM,
    }).map((sheet) => ({
      filename: sheet.filename,
      content: Buffer.from(sheet.content, "utf8").toString("base64"),
    }));
    const csvAttachment = {
      filename: `quote-request-${slugify(normalized.customerName || "customer")}.csv`,
      content: Buffer.from(buildQuoteCsv(normalized), "utf8").toString("base64"),
    };

    try {
      await sendResendEmail({
        to: [PRIMARY_QUOTE_RECIPIENT],
        subject: internalMessage.subject,
        text: internalMessage.text,
        html: internalMessage.html,
        replyTo: normalized.customerEmail || REPLY_TO_EMAIL,
        attachments: [
          csvAttachment,
          ...sheetLayoutAttachments,
        ],
      });
    } catch (error) {
      console.error("Primary internal quote email failed:", error);
      throw error;
    }

    try {
      await sendResendEmail({
        to: [SECONDARY_QUOTE_RECIPIENT],
        subject: internalMessage.subject,
        text: internalMessage.text,
        html: internalMessage.html,
        replyTo: normalized.customerEmail || REPLY_TO_EMAIL,
        attachments: [
          csvAttachment,
          ...sheetLayoutAttachments,
        ],
      });
    } catch (error) {
      console.error("Secondary internal quote copy failed:", error);
    }

    try {
      await sendResendEmail({
        to: [normalized.customerEmail],
        subject: confirmationMessage.subject,
        text: confirmationMessage.text,
        html: confirmationMessage.html,
        replyTo: QUOTE_TO_EMAIL,
        attachments: [csvAttachment],
      });
    } catch (error) {
      console.error("Customer confirmation email failed:", error);
      throw error;
    }

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

async function sendResendEmail({ to, subject, text, html, replyTo, attachments = [] }) {
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: QUOTE_FROM_EMAIL,
      to,
      subject,
      text,
      html,
      reply_to: replyTo ? [replyTo] : undefined,
      attachments,
    }),
  });

  if (!resendResponse.ok) {
    const errorBody = await resendResponse.text();
    throw createEmailProviderError(resendResponse.status, errorBody);
  }
}

function normalizeQuotePayload(payload) {
  const customerName = String(payload?.customerName || "").trim();
  const customerEmail = String(payload?.customerEmail || "").trim();
  const customerPhone = String(payload?.customerPhone || "").trim();
  const items = Array.isArray(payload?.items) ? payload.items : [];

  if (!customerName) {
    throw new Error("Please enter your name before requesting a quote.");
  }

  if (!customerEmail || !isValidEmail(customerEmail)) {
    throw new Error("Please enter a valid email address before requesting a quote.");
  }

  if (items.length === 0) {
    throw new Error("Add at least one plank before requesting a quote.");
  }

  return {
    customerName,
    customerEmail,
    customerPhone,
    items: items.map((item, index) => normalizeQuoteItem(item, index)),
  };
}

function normalizeQuoteItem(item, index) {
  const values = item?.values ?? {};
  const normalizedValues = {
    materialKey: String(values.materialKey || "birch-multiplex"),
    materialLabel: String(values.materialLabel || getMaterialByKey(values.materialKey).label),
    materialVariantKey: String(values.materialVariantKey || "multiplex-b-bb"),
    materialVariantLabel: String(values.materialVariantLabel || "Multiplex B/BB"),
    quantity: Math.max(1, Math.floor(Number(values.quantity || 1))),
    lengthMm: toPositiveNumber(values.lengthMm, "length"),
    widthMm: toPositiveNumber(values.widthMm, "width"),
    thicknessMm: toPositiveNumber(values.thicknessMm, "thickness"),
    roundedCorners: Boolean(values.roundedCorners),
    cornerRadiusMm: Number(values.cornerRadiusMm || 0),
    holeEnabled: Boolean(values.holeEnabled),
    holeXmm: Number(values.holeXmm || 0),
    holeYmm: Number(values.holeYmm || 0),
    holeCountX: Math.max(1, Math.floor(Number(values.holeCountX || 1))),
    holeCountY: Math.max(1, Math.floor(Number(values.holeCountY || 1))),
    holeDiameterMm: Number(values.holeDiameterMm || 0),
  };

  return {
    title: String(item?.title || `Plank ${index + 1}`),
    description: String(item?.description || ""),
    values: {
      ...normalizedValues,
      pricing: calculatePlatePricing(normalizedValues),
    },
  };
}

function buildInternalEmail({ customerName, customerEmail, customerPhone, items }) {
  const lines = [
    "New quote request from the plate configurator.",
    "",
    "Customer details",
    `Name: ${customerName}`,
    `Email: ${customerEmail}`,
    `Phone: ${customerPhone || "-"}`,
    `Sheet layout: ${STOCK_SHEET_LENGTH_MM} x ${STOCK_SHEET_WIDTH_MM} mm, margin ${SHEET_LAYOUT_MARGIN_MM} mm, gap ${SHEET_LAYOUT_GAP_MM} mm`,
    "",
    "Selected planks",
    ...items.flatMap((item) => [
      item.title,
      item.description,
      `Path length: ${formatMeters(item.values.pricing.cutLengthM)}`,
      `Material: ${formatEuro(item.values.pricing.materialPriceEur)}, milling: ${formatEuro(item.values.pricing.millingPriceEur)}, unit: ${formatEuro(item.values.pricing.unitPriceEur)}, total: ${formatEuro(item.values.pricing.totalPriceEur)}`,
      "",
    ]),
  ];

  return {
    subject: `Quote request from ${customerName}`,
    text: lines.join("\n"),
    html: buildEmailHtml({
      intro: "New quote request from the plate configurator.",
      lead: "Customer details and selected planks are listed below.",
      items,
      details: [
        ["Name", customerName],
        ["Email", customerEmail],
        ["Phone", customerPhone || "-"],
        ["Sheet layout", `${STOCK_SHEET_LENGTH_MM} x ${STOCK_SHEET_WIDTH_MM} mm`],
        ["Sheet margin / gap", `${SHEET_LAYOUT_MARGIN_MM} mm / ${SHEET_LAYOUT_GAP_MM} mm`],
      ],
    }),
  };
}

function buildConfirmationEmail({ customerName, items }) {
  const lines = [
    `Hi ${customerName},`,
    "",
    "Thanks for your quote request. We received the plank set below and will get back to you as soon as possible.",
    "",
    ...items.flatMap((item) => [
      `${item.title}: ${item.description}`,
      `Path length: ${formatMeters(item.values.pricing.cutLengthM)}`,
      `Material: ${formatEuro(item.values.pricing.materialPriceEur)}, milling: ${formatEuro(item.values.pricing.millingPriceEur)}, unit: ${formatEuro(item.values.pricing.unitPriceEur)}, total: ${formatEuro(item.values.pricing.totalPriceEur)}`,
      "",
    ]),
    "Kind regards,",
    "Knal Amsterdam",
  ];

  return {
    subject: "We received your quote request",
    text: lines.join("\n"),
    html: buildEmailHtml({
      greeting: `Hi ${customerName},`,
      lead: "Thanks for your quote request. We received the plank set below and will get back to you as soon as possible.",
      items,
      closing: ["Kind regards,", "Knal Amsterdam"],
    }),
  };
}

function buildEmailHtml({ greeting = "", intro = "", lead = "", items, details = [], closing = [] }) {
  const detailRows = details.length > 0
    ? `
      <table style="border-collapse:collapse;margin:0 0 24px;width:100%;max-width:640px;">
        <tbody>
          ${details.map(([label, value]) => `
            <tr>
              <td style="padding:8px 12px 8px 0;font-weight:700;color:#0f172a;vertical-align:top;">${escapeHtml(label)}</td>
              <td style="padding:8px 0;color:#334155;">${escapeHtml(value)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "";

  return `
    <div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1f2937;">
      ${greeting ? `<p style="margin:0 0 24px;">${escapeHtml(greeting)}</p>` : ""}
      ${intro ? `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>` : ""}
      ${lead ? `<p style="margin:0 0 24px;">${escapeHtml(lead)}</p>` : ""}
      ${detailRows}
      ${buildItemsTableHtml(items)}
      ${closing.map((line) => `<p style="margin:24px 0 0;">${escapeHtml(line)}</p>`).join("")}
    </div>
  `;
}

function buildItemsTableHtml(items) {
  const groupedItems = groupItemsByThickness(items);
  const totalColumns = 14;
  const rows = groupedItems.map(({ thicknessMm, items: batchItems }) => {
    const itemRows = batchItems.map((item) => {
      const pricing = item.values.pricing;
      const holeSummary = item.values.holeEnabled
        ? `${item.values.holeCountX}x${item.values.holeCountY}, first ${item.values.holeXmm}/${item.values.holeYmm} mm, diameter ${item.values.holeDiameterMm} mm`
        : "No holes";
      const cornerSummary = item.values.roundedCorners
        ? `Rounded ${item.values.cornerRadiusMm} mm`
        : "Square";

      return `
        <tr>
          <td style="border:1px solid #dbe4f0;padding:10px;font-weight:700;">${escapeHtml(item.title)}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(String(item.values.quantity))}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(item.values.materialLabel)}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(item.values.materialVariantLabel)}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(String(item.values.lengthMm))}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(String(item.values.widthMm))}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(String(item.values.thicknessMm))}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(cornerSummary)}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(holeSummary)}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatMeters(pricing.cutLengthM))}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(pricing.materialPriceEur))}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(pricing.millingPriceEur))}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(pricing.unitPriceEur))}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(pricing.totalPriceEur))}</td>
        </tr>
      `;
    }).join("");

    return `${itemRows}${buildThicknessSubtotalRow(thicknessMm, batchItems, totalColumns)}`;
  }).join("");

  const grandTotalRow = buildGrandTotalRow(items, totalColumns);

  return `
    <table style="border-collapse:collapse;width:100%;max-width:720px;margin:0 0 24px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Plank</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Qty</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Material</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Variant</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Length (mm)</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Width (mm)</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Thickness (mm)</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Corners</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Holes</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Path length</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Material price</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Milling price</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Unit price</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Total price</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${grandTotalRow}
      </tbody>
    </table>
  `;
}

function buildQuoteCsv({ customerName, customerEmail, customerPhone, items }) {
  const header = [
    "Customer Name",
    "Customer Email",
    "Customer Phone",
    "Plank",
    "Quantity",
    "Material",
    "Variant",
    "Length (mm)",
    "Width (mm)",
    "Thickness (mm)",
    "Corners",
    "Corner Radius (mm)",
    "Holes",
    "Hole Count X",
    "Hole Count Y",
    "Hole X (mm)",
    "Hole Y (mm)",
    "Hole Diameter (mm)",
    "Path Length (m)",
    "Material Price",
    "Milling Price",
    "Unit Price",
    "Total Price",
    "Description",
  ];

  const rows = [];

  for (const { thicknessMm, items: batchItems } of groupItemsByThickness(items)) {
    for (const item of batchItems) {
      rows.push([
        customerName,
        customerEmail,
        customerPhone || "",
        item.title,
        item.values.quantity,
        item.values.materialLabel,
        item.values.materialVariantLabel,
        item.values.lengthMm,
        item.values.widthMm,
        item.values.thicknessMm,
        item.values.roundedCorners ? "Rounded" : "Square",
        item.values.roundedCorners ? item.values.cornerRadiusMm : "",
        item.values.holeEnabled ? "Yes" : "No",
        item.values.holeEnabled ? item.values.holeCountX : "",
        item.values.holeEnabled ? item.values.holeCountY : "",
        item.values.holeEnabled ? item.values.holeXmm : "",
        item.values.holeEnabled ? item.values.holeYmm : "",
        item.values.holeEnabled ? item.values.holeDiameterMm : "",
        formatDecimal(item.values.pricing.cutLengthM),
        formatEuro(item.values.pricing.materialPriceEur),
        formatEuro(item.values.pricing.millingPriceEur),
        formatEuro(item.values.pricing.unitPriceEur),
        formatEuro(item.values.pricing.totalPriceEur),
        item.description,
      ]);
    }

    rows.push(createCsvSubtotalRow(thicknessMm, batchItems));
  }

  rows.push(createCsvGrandTotalRow(items));

  return [header, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
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

function toPositiveNumber(value, fieldName) {
  const number = Number(value);

  if (!(number > 0)) {
    throw new Error(`Invalid ${fieldName} value in quote item.`);
  }

  return number;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeCsv(value) {
  const normalized = String(value ?? "");
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function formatMeters(value) {
  return `${formatDecimal(value)} m`;
}

function formatDecimal(value) {
  return Number(value || 0).toFixed(2);
}

function groupItemsByThickness(items) {
  const groups = new Map();

  for (const item of items) {
    const thicknessMm = item.values.thicknessMm;

    if (!groups.has(thicknessMm)) {
      groups.set(thicknessMm, []);
    }

    groups.get(thicknessMm).push(item);
  }

  return Array.from(groups.entries()).map(([thicknessMm, groupedItems]) => ({
    thicknessMm,
    items: groupedItems,
  }));
}

function buildThicknessSubtotalRow(thicknessMm, items, totalColumns) {
  const totals = summarizeItems(items);
  return `
    <tr style="background:#eef4ff;font-weight:700;">
      <td colspan="${totalColumns - 1}" style="border:1px solid #dbe4f0;padding:10px;text-align:right;">Subtotal ${escapeHtml(String(thicknessMm))} mm batch</td>
      <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(totals.totalPriceEur))}</td>
    </tr>
  `;
}

function buildGrandTotalRow(items, totalColumns) {
  const totals = summarizeItems(items);
  return `
    <tr style="background:#dbeafe;font-weight:800;">
      <td colspan="${totalColumns - 1}" style="border:1px solid #93c5fd;padding:10px;text-align:right;">Grand total</td>
      <td style="border:1px solid #93c5fd;padding:10px;">${escapeHtml(formatEuro(totals.totalPriceEur))}</td>
    </tr>
  `;
}

function createCsvSubtotalRow(thicknessMm, items) {
  const totals = summarizeItems(items);
  return [
    "",
    "",
    "",
    `Subtotal ${thicknessMm} mm batch`,
    totals.quantity,
    "",
    "",
    "",
    "",
    thicknessMm,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    formatDecimal(totals.cutLengthM),
    formatEuro(totals.materialPriceEur),
    formatEuro(totals.millingPriceEur),
    "",
    formatEuro(totals.totalPriceEur),
    "",
  ];
}

function createCsvGrandTotalRow(items) {
  const totals = summarizeItems(items);
  return [
    "",
    "",
    "",
    "Grand total",
    totals.quantity,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    formatDecimal(totals.cutLengthM),
    formatEuro(totals.materialPriceEur),
    formatEuro(totals.millingPriceEur),
    "",
    formatEuro(totals.totalPriceEur),
    "",
  ];
}

function summarizeItems(items) {
  return items.reduce((totals, item) => ({
    quantity: totals.quantity + Number(item.values.quantity || 0),
    cutLengthM: totals.cutLengthM + Number(item.values.pricing.cutLengthM || 0) * Number(item.values.quantity || 1),
    materialPriceEur: totals.materialPriceEur + Number(item.values.pricing.materialPriceEur || 0) * Number(item.values.quantity || 1),
    millingPriceEur: totals.millingPriceEur + Number(item.values.pricing.millingPriceEur || 0) * Number(item.values.quantity || 1),
    totalPriceEur: totals.totalPriceEur + Number(item.values.pricing.totalPriceEur || 0),
  }), {
    quantity: 0,
    cutLengthM: 0,
    materialPriceEur: 0,
    millingPriceEur: 0,
    totalPriceEur: 0,
  });
}


function isUserInputError(error) {
  return error instanceof Error && (
    error.message.startsWith("Please ") ||
    error.message.startsWith("Add at least ") ||
    error.message.startsWith("Invalid ")
  );
}

function getEmailConfigurationError() {
  const missingKeys = [];

  if (!RESEND_API_KEY) {
    missingKeys.push("RESEND_API_KEY");
  }

  if (!QUOTE_FROM_EMAIL) {
    missingKeys.push("QUOTE_FROM_EMAIL");
  }

  if (missingKeys.length > 0) {
    return `Email sending is not configured yet. Add ${missingKeys.join(" and ")} to the server environment.`;
  }

  if (!isValidEmail(PRIMARY_QUOTE_RECIPIENT)) {
    return "QUOTE_TO_EMAIL is not a valid email address.";
  }

  if (!isValidEmail(SECONDARY_QUOTE_RECIPIENT)) {
    return "The secondary internal quote recipient is not a valid email address.";
  }

  if (!isValidEmail(QUOTE_FROM_EMAIL)) {
    return "QUOTE_FROM_EMAIL is not a valid email address.";
  }

  if (REPLY_TO_EMAIL && !isValidEmail(REPLY_TO_EMAIL)) {
    return "QUOTE_REPLY_TO_EMAIL is not a valid email address.";
  }

  return "";
}

function createEmailProviderError(statusCode, errorBody) {
  const normalizedBody = String(errorBody || "").trim();
  const lowerBody = normalizedBody.toLowerCase();
  const providerMessage = normalizedBody
    ? ` Resend responded with ${statusCode}: ${normalizedBody}`
    : ` Resend responded with status ${statusCode}.`;

  if (
    lowerBody.includes("verify") ||
    lowerBody.includes("domain") ||
    lowerBody.includes("sender") ||
    lowerBody.includes("from address")
  ) {
    return new Error(
      `Email sending failed because the sender address is not verified yet. Verify ${QUOTE_FROM_EMAIL} or the knalamsterdam.com domain in Resend, then try again.${NODE_ENV === "development" ? providerMessage : ""}`
    );
  }

  if (statusCode === 401 || statusCode === 403 || lowerBody.includes("api key")) {
    return new Error(
      `Email sending failed because the Resend API key is missing or invalid.${NODE_ENV === "development" ? providerMessage : ""}`
    );
  }

  return new Error(
    `The quote request could not be sent through the email provider.${NODE_ENV === "development" ? providerMessage : ""}`
  );
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
