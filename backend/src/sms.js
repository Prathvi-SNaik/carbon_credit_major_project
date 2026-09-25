import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTBOX = path.join(__dirname, "../sms_outbox.jsonl");

export function normalizeMobile(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  if (d.length !== 10) return null;
  return d;
}

export async function sendOtpSms(mobile10, code) {
  const message = `CarbonCreditFarm verification code: ${code}. Valid 5 minutes. Do not share this OTP.`;
  const record = { to: mobile10, message, at: new Date().toISOString() };

  if (process.env.FAST2SMS_API_KEY) {
    const url = new URL("https://www.fast2sms.com/dev/bulkV2");
    url.searchParams.set("authorization", process.env.FAST2SMS_API_KEY);
    url.searchParams.set("route", "q");
    url.searchParams.set("message", message);
    url.searchParams.set("language", "english");
    url.searchParams.set("flash", "0");
    url.searchParams.set("numbers", mobile10);
    const r = await fetch(url, { method: "GET" });
    const body = await r.text();
    record.provider = "FAST2SMS";
    record.response = body.slice(0, 500);
    appendOutbox(record);
    if (!r.ok) {
      return { sent: false, provider: "FAST2SMS", masked: mask(mobile10), hint: body.slice(0, 180) };
    }
    return { sent: true, provider: "FAST2SMS", masked: mask(mobile10) };
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        To: `+91${mobile10}`,
        From: process.env.TWILIO_FROM,
        Body: message,
      }),
    });
    const body = await r.text();
    record.provider = "TWILIO";
    record.response = body.slice(0, 500);
    appendOutbox(record);
    if (!r.ok) {
      return { sent: false, provider: "TWILIO", masked: mask(mobile10), hint: body.slice(0, 180) };
    }
    return { sent: true, provider: "TWILIO", masked: mask(mobile10) };
  }

  record.provider = "OUTBOX_ONLY";
  appendOutbox(record);
  console.log(`[SMS outbox] +91${mobile10} OTP ${code}`);
  return {
    sent: false,
    provider: "OUTBOX_ONLY",
    masked: mask(mobile10),
    hint: "Set FAST2SMS_API_KEY or TWILIO_* in .env to deliver the OTP by SMS.",
  };
}

function mask(m) {
  return `******${m.slice(-4)}`;
}

function appendOutbox(row) {
  fs.appendFileSync(OUTBOX, JSON.stringify(row) + "\n");
}
