import { getEmailConfigurationError, isUserInputError, sendQuoteRequestEmails } from "../js/quote-email.js";

const TO_ADDRESS = "Info@thecarvecompany.com";
const FROM_ADDRESS = "ideas@knalamsterdam.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const resendApiKey = process.env.RESEND_API_KEY || "";
  const replyToEmail = process.env.QUOTE_REPLY_TO_EMAIL || TO_ADDRESS;
  const nodeEnv = process.env.NODE_ENV || "production";
  const configError = getEmailConfigurationError({
    resendApiKey,
    quoteToEmail: TO_ADDRESS,
    quoteFromEmail: FROM_ADDRESS,
    replyToEmail,
  });

  if (configError) {
    return res.status(500).json({ error: configError });
  }

  try {
    await sendQuoteRequestEmails({
      payload: req.body,
      resendApiKey,
      quoteToEmail: TO_ADDRESS,
      quoteFromEmail: FROM_ADDRESS,
      replyToEmail,
      nodeEnv,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Quote request failed:", error);
    const message = error instanceof Error ? error.message : "The quote request could not be processed.";
    const statusCode = isUserInputError(error) ? 400 : 502;
    return res.status(statusCode).json({ error: message });
  }
}
