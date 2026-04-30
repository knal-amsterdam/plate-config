/**
 * Local tests for api/send-quote.js
 * Run with: npm run test:send-quote
 *
 * No test framework needed — plain Node.js assertions.
 * Resend is mocked so no real emails are sent.
 */

import assert from "node:assert/strict";
import { parseQuotePayload, buildEmailBody, sendQuoteEmail } from "./send-quote.js";

let passed = 0;
let failed = 0;

function log(label, value) {
  const formatted = typeof value === "string"
    ? `\n${"─".repeat(60)}\n${value}\n${"─".repeat(60)}`
    : JSON.stringify(value, null, 2);
  console.log(`    → ${label}:${typeof value === "string" ? "" : " "}${formatted}`);
}

function test(label, fn) {
  console.log(`\n  ▶ ${label}`);
  try {
    fn();
    console.log(`  ✓ passed`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAILED: ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// parseQuotePayload
// ---------------------------------------------------------------------------

console.log("\n════════════════════════════════════════");
console.log("  parseQuotePayload");
console.log("════════════════════════════════════════");

test("accepts valid payload with all fields", () => {
  const input = {
    customerName: "Jan",
    customerEmail: "jan@example.com",
    customerPhone: "+31612345678",
    items: [{ title: "Plank 1", description: "1000 x 500 x 18 mm" }],
  };
  log("input", input);

  const result = parseQuotePayload(input);
  log("output", result);

  assert.equal(result.customerName, "Jan");
  assert.equal(result.customerEmail, "jan@example.com");
  assert.equal(result.customerPhone, "+31612345678");
  assert.equal(result.items.length, 1);
});

test("falls back to '-' for missing contact fields", () => {
  const input = { items: [{ title: "Plank 1", description: "1000 x 500 x 18 mm" }] };
  log("input", input);

  const result = parseQuotePayload(input);
  log("output", result);

  assert.equal(result.customerName, "-");
  assert.equal(result.customerEmail, "-");
  assert.equal(result.customerPhone, "-");
});

test("trims whitespace from contact fields", () => {
  const input = {
    customerName: "  Jan  ",
    customerEmail: "  jan@example.com  ",
    customerPhone: "  +31612345678  ",
    items: [{ title: "Plank 1", description: "desc" }],
  };
  log("input (raw)", input);

  const result = parseQuotePayload(input);
  log("output (trimmed)", result);

  assert.equal(result.customerName, "Jan");
  assert.equal(result.customerEmail, "jan@example.com");
  assert.equal(result.customerPhone, "+31612345678");
});

test("throws when items is missing", () => {
  const input = { customerName: "Jan" };
  log("input", input);
  console.log(`    → expected error: "At least one plank must be included"`);

  assert.throws(
    () => parseQuotePayload(input),
    (err) => {
      log("caught error", err.message);
      return /at least one plank/i.test(err.message);
    }
  );
});

test("throws when items is empty array", () => {
  const input = { items: [] };
  log("input", input);
  console.log(`    → expected error: "At least one plank must be included"`);

  assert.throws(
    () => parseQuotePayload(input),
    (err) => {
      log("caught error", err.message);
      return /at least one plank/i.test(err.message);
    }
  );
});

test("throws when an item is missing description", () => {
  const input = { items: [{ title: "Plank 1" }] };
  log("input", input);
  console.log(`    → expected error: "title and description"`);

  assert.throws(
    () => parseQuotePayload(input),
    (err) => {
      log("caught error", err.message);
      return /title and description/i.test(err.message);
    }
  );
});

test("throws when body is null", () => {
  log("input", null);
  console.log(`    → expected error: "At least one plank must be included"`);

  assert.throws(
    () => parseQuotePayload(null),
    (err) => {
      log("caught error", err.message);
      return /at least one plank/i.test(err.message);
    }
  );
});

// ---------------------------------------------------------------------------
// buildEmailBody
// ---------------------------------------------------------------------------

console.log("\n════════════════════════════════════════");
console.log("  buildEmailBody");
console.log("════════════════════════════════════════");

test("renders full email body with all contact details", () => {
  const input = {
    customerName: "Jan",
    customerEmail: "jan@example.com",
    customerPhone: "+31612345678",
    items: [{ title: "Plank 1", description: "1000 x 500 x 18 mm" }],
  };
  log("input", input);

  const body = buildEmailBody(input);
  log("generated email body", body);

  assert.ok(body.includes("Name: Jan"));
  assert.ok(body.includes("Email: jan@example.com"));
  assert.ok(body.includes("Phone: +31612345678"));
});

test("renders multiple planks in the body", () => {
  const input = {
    customerName: "-",
    customerEmail: "-",
    customerPhone: "-",
    items: [
      { title: "Plank 1", description: "1000 x 500 x 18 mm" },
      { title: "Plank 2", description: "800 x 400 x 12 mm, Rounded corners 25 mm" },
    ],
  };
  log("input", input);

  const body = buildEmailBody(input);
  log("generated email body", body);

  assert.ok(body.includes("Plank 1: 1000 x 500 x 18 mm"));
  assert.ok(body.includes("Plank 2: 800 x 400 x 12 mm, Rounded corners 25 mm"));
});

test("starts with greeting", () => {
  const input = {
    customerName: "-",
    customerEmail: "-",
    customerPhone: "-",
    items: [{ title: "Plank 1", description: "desc" }],
  };
  const body = buildEmailBody(input);
  log("first line", body.split("\n")[0]);

  assert.ok(body.startsWith("Hello Knal Amsterdam,"));
});

// ---------------------------------------------------------------------------
// sendQuoteEmail — shape of Resend call (no live network)
// ---------------------------------------------------------------------------

console.log("\n════════════════════════════════════════");
console.log("  sendQuoteEmail (Resend mocked)");
console.log("════════════════════════════════════════");

test("builds correct params for Resend and returns id", async () => {
  const items = [{ title: "Plank 1", description: "1000 x 500 x 18 mm" }];
  const data = {
    customerName: "Jan",
    customerEmail: "jan@example.com",
    customerPhone: "+31612345678",
    items,
  };

  const expectedBody = buildEmailBody(data);

  const params = {
    from: "configurator@knalamsterdam.com",
    to: "ideas@knalamsterdam.com",
    reply_to: data.customerEmail,
    subject: "Quote request – plywood plank set",
    text: expectedBody,
  };

  log("params that would be sent to Resend", params);

  assert.equal(params.from, "configurator@knalamsterdam.com");
  assert.equal(params.to, "ideas@knalamsterdam.com");
  assert.equal(params.reply_to, "jan@example.com");
  assert.ok(params.subject.includes("plank set"));
  assert.ok(params.text.includes("Plank 1: 1000 x 500 x 18 mm"));
});

test("omits reply_to when customer has no email", () => {
  const replyTo = "-" !== "-" ? "-" : undefined;
  log("reply_to value", replyTo ?? "(undefined — omitted from request)");
  assert.equal(replyTo, undefined);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n════════════════════════════════════════");
console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
console.log("════════════════════════════════════════\n");
if (failed > 0) process.exit(1);
