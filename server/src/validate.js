"use strict";

const messages = require("./messages");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(value) {
  const raw = String(value ?? "");
  if (/[\u0000-\u001F\u007F]/.test(raw)) {
    return { ok: false, message: messages.INVALID_EMAIL };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: messages.EMPTY_EMAIL };
  }
  if (trimmed.length > 254) {
    return { ok: false, message: messages.INVALID_EMAIL };
  }
  const email = trimmed.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: messages.INVALID_EMAIL };
  }
  return { ok: true, email };
}

function validateIdempotencyKey(key) {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(key)) {
    return {
      ok: false,
      message: "Retry key was missing or invalid. Reload the page and try again.",
    };
  }
  return { ok: true, key };
}

/**
 * marketing_opt_in is a sheet column. This build records false only.
 * Any other client value is rejected so consent cannot be forged.
 */
function marketingOptInRejected(body) {
  if (!body || typeof body !== "object") return false;
  const value = Object.prototype.hasOwnProperty.call(body, "marketingOptIn")
    ? body.marketingOptIn
    : Object.prototype.hasOwnProperty.call(body, "marketing_opt_in")
      ? body.marketing_opt_in
      : undefined;
  if (value === undefined) return false;
  return !(value === false || value === "false");
}

module.exports = {
  normalizeEmail,
  validateEmail,
  validateIdempotencyKey,
  marketingOptInRejected,
};
