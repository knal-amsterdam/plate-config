import { createPlateDxf, createSheetLayoutDxfs, createSheetLayoutPlan } from "./dxf.js";
import {
  calculatePlatePricing,
  formatEuro,
  getMaterialByKey,
  SHEET_LAYOUT_GAP_MM,
  SHEET_LAYOUT_MARGIN_MM,
  STOCK_SHEET_LENGTH_MM,
  STOCK_SHEET_WIDTH_MM,
  TRANSPORT_HANDLING_PRICE_EUR,
} from "./pricing.js";

export async function sendQuoteRequestEmails({
  payload,
  resendApiKey,
  quoteToEmail,
  quoteFromEmail,
  replyToEmail,
  nodeEnv = "development",
}) {
  const configError = getEmailConfigurationError({
    resendApiKey,
    quoteToEmail,
    quoteFromEmail,
    replyToEmail,
  });

  if (configError) {
    throw new Error(configError);
  }

  const normalized = normalizeQuotePayload(payload);
  const layoutOptions = {
    sheetLengthMm: STOCK_SHEET_LENGTH_MM,
    sheetWidthMm: STOCK_SHEET_WIDTH_MM,
    marginMm: SHEET_LAYOUT_MARGIN_MM,
    gapMm: SHEET_LAYOUT_GAP_MM,
  };
  const sheetLayoutPlan = createSheetLayoutPlan(normalized.items, layoutOptions);
  const batchSummaries = createBatchSummaries(normalized.items, sheetLayoutPlan);
  const internalMessage = buildInternalEmail(normalized, batchSummaries);
  const confirmationMessage = buildConfirmationEmail(normalized, batchSummaries);
  const sheetLayoutAttachments = createSheetLayoutDxfs(normalized.items, layoutOptions).map((sheet) => ({
    filename: sheet.filename,
    content: Buffer.from(sheet.content, "utf8").toString("base64"),
  }));
  const plateDxfZipAttachment = {
    filename: `plate-dxf-files-${slugify(normalized.customerName || "customer")}.zip`,
    content: createZipArchiveBase64(normalized.items.map((item, index) => ({
      filename: `plate-${slugify(item.title || `plank-${index + 1}`)}.dxf`,
      content: createPlateDxf(item),
    }))),
  };
  const csvAttachment = {
    filename: `quote-request-${slugify(normalized.customerName || "customer")}.csv`,
    content: Buffer.from(buildQuoteCsv(normalized, batchSummaries), "utf8").toString("base64"),
  };
  const attachments = [csvAttachment, plateDxfZipAttachment, ...sheetLayoutAttachments];

  await sendResendEmail({
    resendApiKey,
    quoteFromEmail,
    to: [quoteToEmail],
    subject: internalMessage.subject,
    text: internalMessage.text,
    html: internalMessage.html,
    replyTo: normalized.customerEmail || replyToEmail,
    attachments,
    nodeEnv,
  });

  await sendResendEmail({
    resendApiKey,
    quoteFromEmail,
    to: [normalized.customerEmail],
    subject: confirmationMessage.subject,
    text: confirmationMessage.text,
    html: confirmationMessage.html,
    replyTo: quoteToEmail,
    attachments,
    nodeEnv,
  });

  return {
    ok: true,
    normalized,
    attachments,
  };
}

export function normalizeQuotePayload(payload) {
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

export function isUserInputError(error) {
  return error instanceof Error && (
    error.message.startsWith("Please ") ||
    error.message.startsWith("Add at least ") ||
    error.message.startsWith("Invalid ")
  );
}

export function getEmailConfigurationError({
  resendApiKey,
  quoteToEmail,
  quoteFromEmail,
  replyToEmail = "",
}) {
  const missingKeys = [];

  if (!resendApiKey) {
    missingKeys.push("RESEND_API_KEY");
  }

  if (!quoteFromEmail) {
    missingKeys.push("QUOTE_FROM_EMAIL");
  }

  if (missingKeys.length > 0) {
    return `Email sending is not configured yet. Add ${missingKeys.join(" and ")} to the server environment.`;
  }

  if (!isValidEmail(quoteToEmail)) {
    return "QUOTE_TO_EMAIL is not a valid email address.";
  }

  if (!isValidEmail(quoteFromEmail)) {
    return "QUOTE_FROM_EMAIL is not a valid email address.";
  }

  if (replyToEmail && !isValidEmail(replyToEmail)) {
    return "QUOTE_REPLY_TO_EMAIL is not a valid email address.";
  }

  return "";
}

async function sendResendEmail({
  resendApiKey,
  quoteFromEmail,
  to,
  subject,
  text,
  html,
  replyTo,
  attachments = [],
  nodeEnv,
}) {
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: quoteFromEmail,
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
    throw createEmailProviderError({
      statusCode: resendResponse.status,
      errorBody,
      quoteFromEmail,
      nodeEnv,
    });
  }
}

function normalizeQuoteItem(item, index) {
  const values = item?.values ?? {};
  const materialKey = String(values.materialKey || "birch-multiplex");
  const normalizedValues = {
    materialKey,
    materialLabel: String(values.materialLabel || getMaterialByKey(materialKey).label),
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

function buildInternalEmail({ customerName, customerEmail, customerPhone, items }, batchSummaries) {
  const detailRows = [
    ["Name", customerName],
    ["Email", customerEmail],
    ["Phone", customerPhone || "-"],
    ["Sheet layout", `${STOCK_SHEET_LENGTH_MM} x ${STOCK_SHEET_WIDTH_MM} mm`],
    ["Sheet margin / gap", `${SHEET_LAYOUT_MARGIN_MM} mm / ${SHEET_LAYOUT_GAP_MM} mm`],
    ...buildThicknessBasePriceRows(batchSummaries),
    ["Transport / handling", formatEuro(TRANSPORT_HANDLING_PRICE_EUR)],
  ];
  const lines = [
    "New quote request from the plate configurator.",
    "",
    "Customer details",
    `Name: ${customerName}`,
    `Email: ${customerEmail}`,
    `Phone: ${customerPhone || "-"}`,
    `Sheet layout: ${STOCK_SHEET_LENGTH_MM} x ${STOCK_SHEET_WIDTH_MM} mm, margin ${SHEET_LAYOUT_MARGIN_MM} mm, gap ${SHEET_LAYOUT_GAP_MM} mm`,
    ...buildThicknessBasePriceRows(batchSummaries).map(([label, value]) => `${label}: ${value}`),
    `Transport / handling: ${formatEuro(TRANSPORT_HANDLING_PRICE_EUR)}`,
    "",
    "Selected planks",
    ...items.flatMap((item) => [
      item.title,
      item.description,
      `Path length: ${formatMeters(item.values.pricing.cutLengthM)}`,
      "",
    ]),
    ...buildBatchSummaryLines(batchSummaries),
    `Grand total incl. transport / handling: ${formatEuro(summarizeOrder(batchSummaries).grandTotalEur)}`,
  ];

  return {
    subject: `Quote request from ${customerName}`,
    text: lines.join("\n"),
    html: buildEmailHtml({
      intro: "New quote request from the plate configurator.",
      lead: "Customer details and selected planks are listed below.",
      items,
      batchSummaries,
      details: detailRows,
    }),
  };
}

function buildConfirmationEmail({ customerName, items }, batchSummaries) {
  const lines = [
    `Hi ${customerName},`,
    "",
    "Thanks for your quote request. We received the plank set below and will get back to you as soon as possible.",
    "",
    ...items.flatMap((item) => [
      `${item.title}: ${item.description}`,
      `Path length: ${formatMeters(item.values.pricing.cutLengthM)}`,
      "",
    ]),
    ...buildBatchSummaryLines(batchSummaries),
    ...buildThicknessBasePriceRows(batchSummaries).map(([label, value]) => `${label}: ${value}`),
    `Transport / handling: ${formatEuro(TRANSPORT_HANDLING_PRICE_EUR)}`,
    `Grand total incl. transport / handling: ${formatEuro(summarizeOrder(batchSummaries).grandTotalEur)}`,
    "",
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
      batchSummaries,
      details: [
        ...buildThicknessBasePriceRows(batchSummaries),
        ["Transport / handling", formatEuro(TRANSPORT_HANDLING_PRICE_EUR)],
      ],
      closing: ["Kind regards,", "Knal Amsterdam"],
    }),
  };
}

function buildEmailHtml({ greeting = "", intro = "", lead = "", items, batchSummaries = [], details = [], closing = [] }) {
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
    <div style="font-family:Lexend,'Segoe UI',sans-serif;font-size:16px;line-height:1.5;color:#1f2937;">
      ${greeting ? `<p style="margin:0 0 24px;">${escapeHtml(greeting)}</p>` : ""}
      ${intro ? `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>` : ""}
      ${lead ? `<p style="margin:0 0 24px;">${escapeHtml(lead)}</p>` : ""}
      ${detailRows}
      ${buildItemsTableHtml(items, batchSummaries)}
      ${closing.map((line) => `<p style="margin:24px 0 0;">${escapeHtml(line)}</p>`).join("")}
    </div>
  `;
}

function buildItemsTableHtml(items, batchSummaries) {
  const groupedItems = groupItemsByThickness(items);
  const batchSummaryByThickness = new Map(batchSummaries.map((summary) => [summary.thicknessMm, summary]));
  const rows = groupedItems.map(({ thicknessMm, items: batchItems }) => {
    const batchSummary = batchSummaryByThickness.get(Number(thicknessMm));
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
          <td style="border:1px solid #dbe4f0;padding:10px;">${batchSummary ? escapeHtml(String(batchSummary.sheetCount)) : ""}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${batchSummary ? escapeHtml(formatEuro(batchSummary.stockSheetPriceEur)) : ""}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(cornerSummary)}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(holeSummary)}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatMeters(pricing.cutLengthM))}</td>
          <td style="border:1px solid #dbe4f0;padding:10px;"></td>
          <td style="border:1px solid #dbe4f0;padding:10px;"></td>
          <td style="border:1px solid #dbe4f0;padding:10px;"></td>
          <td style="border:1px solid #dbe4f0;padding:10px;"></td>
          <td style="border:1px solid #dbe4f0;padding:10px;"></td>
        </tr>
      `;
    }).join("");

    return `${itemRows}${buildThicknessSubtotalRow(thicknessMm, batchSummary)}`;
  }).join("");

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
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Required plates</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Base sheet price</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Corners</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Holes</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Path length</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Material cost</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Material + markup</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Milling price</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Unit price</th>
          <th style="border:1px solid #dbe4f0;padding:10px;text-align:left;">Total price</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${buildOrderTransportRow()}
        ${buildGrandTotalRow(batchSummaries)}
      </tbody>
    </table>
  `;
}

function buildQuoteCsv({ customerName, customerEmail, customerPhone, items }, batchSummaries) {
  const batchSummaryByThickness = new Map(batchSummaries.map((summary) => [summary.thicknessMm, summary]));
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
    "Required Plates",
    "Base Sheet Price",
    "Corners",
    "Corner Radius (mm)",
    "Holes",
    "Hole Count X",
    "Hole Count Y",
    "Hole X (mm)",
    "Hole Y (mm)",
    "Hole Diameter (mm)",
    "Path Length (m)",
    "Material Cost",
    "Material + Markup",
    "Milling Price",
    "Unit Price",
    "Total Price",
    "Description",
  ];

  const rows = [];

  for (const { thicknessMm, items: batchItems } of groupItemsByThickness(items)) {
    const batchSummary = batchSummaryByThickness.get(Number(thicknessMm));

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
        batchSummary?.sheetCount ?? "",
        batchSummary ? formatEuro(batchSummary.stockSheetPriceEur) : "",
        item.values.roundedCorners ? "Rounded" : "Square",
        item.values.roundedCorners ? item.values.cornerRadiusMm : "",
        item.values.holeEnabled ? "Yes" : "No",
        item.values.holeEnabled ? item.values.holeCountX : "",
        item.values.holeEnabled ? item.values.holeCountY : "",
        item.values.holeEnabled ? item.values.holeXmm : "",
        item.values.holeEnabled ? item.values.holeYmm : "",
        item.values.holeEnabled ? item.values.holeDiameterMm : "",
        formatDecimal(item.values.pricing.cutLengthM),
        "",
        "",
        "",
        "",
        "",
        item.description,
      ]);
    }

    const subtotalRow = createCsvSubtotalRow(thicknessMm, batchSummary);
    if (subtotalRow.length > 0) {
      rows.push(subtotalRow);
    }
  }

  rows.push(createCsvOrderTransportRow());
  rows.push(createCsvGrandTotalRow(batchSummaries));

  return [header, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
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

function buildThicknessSubtotalRow(thicknessMm, summary) {
  if (!summary) {
    return "";
  }

  return `
    <tr style="background:#eef4ff;font-weight:700;">
      <td colspan="12" style="border:1px solid #dbe4f0;padding:10px;text-align:right;">Subtotal ${escapeHtml(String(thicknessMm))} mm batch (${escapeHtml(String(summary.sheetCount))} required plates / DXF files)</td>
      <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(summary.materialPriceEur))}</td>
      <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(summary.materialPriceWithMarkupEur))}</td>
      <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(summary.millingPriceEur))}</td>
      <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(summary.unitPriceEur))}</td>
      <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(summary.totalPriceEur))}</td>
    </tr>
  `;
}

function buildOrderTransportRow() {
  return `
    <tr style="background:#f8fafc;font-weight:700;">
      <td colspan="16" style="border:1px solid #dbe4f0;padding:10px;text-align:right;">Transport / handling</td>
      <td style="border:1px solid #dbe4f0;padding:10px;">${escapeHtml(formatEuro(TRANSPORT_HANDLING_PRICE_EUR))}</td>
    </tr>
  `;
}

function buildGrandTotalRow(batchSummaries) {
  const totals = summarizeOrder(batchSummaries);
  return `
    <tr style="background:#dbeafe;font-weight:800;">
      <td colspan="12" style="border:1px solid #93c5fd;padding:10px;text-align:right;">Grand total</td>
      <td style="border:1px solid #93c5fd;padding:10px;">${escapeHtml(formatEuro(totals.materialPriceEur))}</td>
      <td style="border:1px solid #93c5fd;padding:10px;">${escapeHtml(formatEuro(totals.materialPriceWithMarkupEur))}</td>
      <td style="border:1px solid #93c5fd;padding:10px;">${escapeHtml(formatEuro(totals.millingPriceEur))}</td>
      <td style="border:1px solid #93c5fd;padding:10px;"></td>
      <td style="border:1px solid #93c5fd;padding:10px;">${escapeHtml(formatEuro(totals.grandTotalEur))}</td>
    </tr>
  `;
}

function createCsvSubtotalRow(thicknessMm, summary) {
  if (!summary) {
    return [];
  }

  return [
    "",
    "",
    "",
    `Subtotal ${thicknessMm} mm batch`,
    summary.quantity,
    "",
    "",
    "",
    "",
    thicknessMm,
    summary.sheetCount,
    formatEuro(summary.stockSheetPriceEur),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    formatDecimal(summary.cutLengthM),
    formatEuro(summary.materialPriceEur),
    formatEuro(summary.materialPriceWithMarkupEur),
    formatEuro(summary.millingPriceEur),
    formatEuro(summary.unitPriceEur),
    formatEuro(summary.totalPriceEur),
    "",
  ];
}

function createCsvOrderTransportRow() {
  return [
    "",
    "",
    "",
    "Transport / handling",
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
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    formatEuro(TRANSPORT_HANDLING_PRICE_EUR),
  ];
}

function createCsvGrandTotalRow(batchSummaries) {
  const totals = summarizeOrder(batchSummaries);
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
    totals.sheetCount,
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
    formatEuro(totals.materialPriceWithMarkupEur),
    formatEuro(totals.millingPriceEur),
    "",
    formatEuro(totals.grandTotalEur),
    "",
  ];
}

function createBatchSummaries(items, sheetLayoutPlan) {
  const quantityByThickness = new Map();
  const cutLengthByThickness = new Map();

  for (const item of items) {
    const thicknessMm = Number(item.values.thicknessMm);
    quantityByThickness.set(thicknessMm, (quantityByThickness.get(thicknessMm) || 0) + Number(item.values.quantity || 0));
    cutLengthByThickness.set(
      thicknessMm,
      (cutLengthByThickness.get(thicknessMm) || 0) + (Number(item.values.pricing.cutLengthM || 0) * Number(item.values.quantity || 1))
    );
  }

  return sheetLayoutPlan
    .map((group) => {
      const thicknessMm = Number(group.items[0]?.values?.thicknessMm || 0);
      const stockSheetPriceEur = Number(group.items[0]?.values?.pricing?.stockSheetPriceEur || 0);
      const sheetCount = Number(group.sheetCount || 0);
      const materialPriceEur = roundCurrency(sheetCount * stockSheetPriceEur);
      const materialPriceWithMarkupEur = roundCurrency(materialPriceEur * 1.5);
      const millingPriceEur = roundCurrency(sheetCount * 100);
      const totalPriceEur = roundCurrency(materialPriceWithMarkupEur + millingPriceEur);

      return {
        thicknessMm,
        quantity: quantityByThickness.get(thicknessMm) || 0,
        cutLengthM: cutLengthByThickness.get(thicknessMm) || 0,
        stockSheetPriceEur,
        sheetCount,
        materialPriceEur,
        materialPriceWithMarkupEur,
        millingPriceEur,
        unitPriceEur: sheetCount > 0 ? roundCurrency(totalPriceEur / sheetCount) : 0,
        totalPriceEur,
      };
    })
    .sort((left, right) => left.thicknessMm - right.thicknessMm);
}

function summarizeOrder(batchSummaries) {
  const totals = batchSummaries.reduce((accumulator, summary) => ({
    quantity: accumulator.quantity + summary.quantity,
    sheetCount: accumulator.sheetCount + summary.sheetCount,
    cutLengthM: accumulator.cutLengthM + summary.cutLengthM,
    materialPriceEur: accumulator.materialPriceEur + summary.materialPriceEur,
    materialPriceWithMarkupEur: accumulator.materialPriceWithMarkupEur + summary.materialPriceWithMarkupEur,
    millingPriceEur: accumulator.millingPriceEur + summary.millingPriceEur,
    totalPriceEur: accumulator.totalPriceEur + summary.totalPriceEur,
  }), {
    quantity: 0,
    sheetCount: 0,
    cutLengthM: 0,
    materialPriceEur: 0,
    materialPriceWithMarkupEur: 0,
    millingPriceEur: 0,
    totalPriceEur: 0,
  });

  return {
    ...totals,
    transportHandlingEur: batchSummaries.length > 0 ? TRANSPORT_HANDLING_PRICE_EUR : 0,
    grandTotalEur: totals.totalPriceEur + (batchSummaries.length > 0 ? TRANSPORT_HANDLING_PRICE_EUR : 0),
  };
}

function buildThicknessBasePriceRows(batchSummaries) {
  return batchSummaries.flatMap((summary) => ([
    [`Base sheet price ${summary.thicknessMm} mm`, formatEuro(summary.stockSheetPriceEur)],
    [`Required plates ${summary.thicknessMm} mm`, String(summary.sheetCount)],
  ]));
}

function buildBatchSummaryLines(batchSummaries) {
  return batchSummaries.flatMap((summary) => [
    `${summary.thicknessMm} mm batch: ${summary.sheetCount} required plates / DXF files`,
    `Base sheet: ${formatEuro(summary.stockSheetPriceEur)}, material cost: ${formatEuro(summary.materialPriceEur)}, material + markup: ${formatEuro(summary.materialPriceWithMarkupEur)}, milling: ${formatEuro(summary.millingPriceEur)}, batch total: ${formatEuro(summary.totalPriceEur)}`,
    "",
  ]);
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

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function createZipArchiveBase64(files) {
  const normalizedFiles = files.map((file) => ({
    filename: String(file.filename || "file.txt"),
    data: Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content || ""), "utf8"),
  }));
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of normalizedFiles) {
    const filenameBuffer = Buffer.from(file.filename, "utf8");
    const crc = crc32(file.data);
    const dosDateTime = getDosDateTime(new Date());

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosDateTime.time, 10);
    localHeader.writeUInt16LE(dosDateTime.date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(file.data.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(filenameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const localPart = Buffer.concat([localHeader, filenameBuffer, file.data]);
    localParts.push(localPart);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosDateTime.time, 12);
    centralHeader.writeUInt16LE(dosDateTime.date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(file.data.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(filenameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(Buffer.concat([centralHeader, filenameBuffer]));
    offset += localPart.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectoryOffset = offset;
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(normalizedFiles.length, 8);
  endOfCentralDirectory.writeUInt16LE(normalizedFiles.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]).toString("base64");
}

function getDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function crc32(buffer) {
  let crc = 0 ^ -1;

  for (let index = 0; index < buffer.length; index += 1) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buffer[index]) & 0xff];
  }

  return (crc ^ -1) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }

    table[index] = crc >>> 0;
  }

  return table;
})();

function createEmailProviderError({ statusCode, errorBody, quoteFromEmail, nodeEnv }) {
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
      `Email sending failed because the sender address is not verified yet. Verify ${quoteFromEmail} or the knalamsterdam.com domain in Resend, then try again.${nodeEnv === "development" ? providerMessage : ""}`
    );
  }

  if (statusCode === 401 || statusCode === 403 || lowerBody.includes("api key")) {
    return new Error(
      `Email sending failed because the Resend API key is missing or invalid.${nodeEnv === "development" ? providerMessage : ""}`
    );
  }

  return new Error(
    `The quote request could not be sent through the email provider.${nodeEnv === "development" ? providerMessage : ""}`
  );
}
