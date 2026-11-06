"use strict";

const messages = require("./messages");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function domainLabelOk(label) {
  if (!label || label.length > 63 || label.startsWith("-") || label.endsWith("-")) return false;
  if (/^[a-z0-9-]+$/i.test(label)) return true;
  return /^[\p{L}\p{N}-]+$/u.test(label);
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
  if (trimmed.length > 254 || trimmed.includes(",") || trimmed.includes("<") || trimmed.includes(">") || trimmed.includes("\"") || trimmed.includes(";") || trimmed.includes("\\") || trimmed.includes("(") || trimmed.includes(")")) {
    return { ok: false, message: messages.INVALID_EMAIL };
  }
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    return { ok: false, message: messages.INVALID_EMAIL };
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return { ok: false, message: messages.INVALID_EMAIL };
  }
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) {
    return { ok: false, message: messages.INVALID_EMAIL };
  }
  const labels = domain.split(".");
  if (labels.length < 2 || domain.includes("..") || !labels.every(domainLabelOk)) {
    return { ok: false, message: messages.INVALID_EMAIL };
  }
  return { ok: true, email: local.toLowerCase() + "@" + domain };
}

function honeypotFilled(body) {
  if (!body || typeof body !== "object") return false;
  const value = body.company_website !== undefined ? body.company_website : body.companyWebsite;
  return typeof value === "string" && value.trim() !== "";
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
  honeypotFilled,
};
