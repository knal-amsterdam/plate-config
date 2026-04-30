import { Resend } from "resend";

const TO_ADDRESS = "Info@thecarvecompany.com";
const FROM_ADDRESS = "configurator@knalamsterdam.com";

/**
 * Validates the incoming request body and returns structured quote data.
 * Throws an Error with a user-facing message if required fields are missing.
 */
export function parseQuotePayload(body) {
  const { customerName, customerEmail, customerPhone, items } = body ?? {};

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one plank must be included in the quote.");
  }

  for (const item of items) {
    if (typeof item.title !== "string" || typeof item.description !== "string") {
      throw new Error("Each quote item must have a title and description.");
    }
  }

  return {
    customerName: String(customerName ?? "").trim() || "-",
    customerEmail: String(customerEmail ?? "").trim() || "-",
    customerPhone: String(customerPhone ?? "").trim() || "-",
    items,
  };
}

/**
 * Builds the plain-text email body from the parsed quote data.
 */
export function buildEmailBody({ customerName, customerEmail, customerPhone, items }) {
  const lines = [
    "Hello Knal Amsterdam,",
    "",
    "Contact details:",
    `Name: ${customerName}`,
    `Email: ${customerEmail}`,
    `Phone: ${customerPhone}`,
    "",
    "Quote request for the following plank set:",
    "",
    ...items.map((item) => `${item.title}: ${item.description}`),
    "",
    "Kind regards,",
    "De Knal Configurator",
  ];

  return lines.join("\n");
}

/**
 * Sends the quote email via Resend.
 * Separated from the handler so it can be swapped in tests.
 */
export async function sendQuoteEmail({ apiKey, customerName, customerEmail, customerPhone, items }) {
  const resend = new Resend(apiKey);
  const text = buildEmailBody({ customerName, customerEmail, customerPhone, items });

  return resend.emails.send({
    from: FROM_ADDRESS,
    to: TO_ADDRESS,
    reply_to: customerEmail !== "-" ? customerEmail : undefined,
    subject: "Quote request – plywood plank set",
    text,
  });
}

/**
 * Vercel serverless handler.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  let payload;
  try {
    payload = parseQuotePayload(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const result = await sendQuoteEmail({ apiKey, ...payload });
    return res.status(200).json({ ok: true, id: result.data?.id });
  } catch (err) {
    console.error("Resend error:", err);
    return res.status(502).json({ error: "Failed to send email. Please try again." });
  }
}
