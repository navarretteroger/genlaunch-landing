"use strict";

const crypto = require("crypto");
const { captureConfigured } = require("./config");
const { validateEmail, validateIdempotencyKey, marketingOptInRejected } = require("./validate");
const messages = require("./messages");

function bodyHash(email, privacyNoticeVersion) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ email, privacyNoticeVersion }))
    .digest("hex");
}

function sheetFailure() {
  return {
    status: 503,
    json: {
      ok: false,
      error: "sheet_unavailable",
      message: messages.SAVE_FAILED,
    },
  };
}

async function performSignup(options) {
  const config = options.config;
  const body = options.body && typeof options.body === "object" ? options.body : {};
  const nowMs = options.nowMs;
  const lock = options.lock;

  if (!captureConfigured(config)) {
    return {
      status: 503,
      json: {
        ok: false,
        error: "capture_not_configured",
        message: messages.PREVIEW_SUBMIT,
      },
    };
  }

  const keyCheck = validateIdempotencyKey(options.idempotencyKey);
  if (!keyCheck.ok) {
    return { status: 400, json: { ok: false, error: "invalid_idempotency_key", message: keyCheck.message } };
  }

  if (marketingOptInRejected(body)) {
    return {
      status: 400,
      json: {
        ok: false,
        error: "marketing_opt_in_not_accepted",
        message: "This form does not collect marketing consent.",
      },
    };
  }

  const emailCheck = validateEmail(body.email);
  if (!emailCheck.ok) {
    return { status: 400, json: { ok: false, error: "invalid_email", field: "email", message: emailCheck.message } };
  }

  if (body.privacyNoticeVersion !== config.privacyNoticeVersion) {
    return {
      status: 400,
      json: {
        ok: false,
        error: "privacy_notice_version",
        message: "Privacy notice is out of date. Reload the page and try again.",
      },
    };
  }

  const hash = bodyHash(emailCheck.email, config.privacyNoticeVersion);

  return lock.run("idem:" + keyCheck.key, async () => {
    const existing = await options.store.get(keyCheck.key);
    if (existing && existing.bodyHash !== hash) {
      return {
        status: 409,
        json: {
          ok: false,
          error: "idempotency_conflict",
          message: "This submission key was already used for a different request. Reload the page and try again.",
        },
      };
    }
    if (existing && existing.bodyHash === hash && existing.grantExpiresAtMs > nowMs + 5000) {
      return { status: existing.status, json: existing.response };
    }

    return lock.run("email:" + emailCheck.email, async () => {
      let signupId;
      let duplicate = false;
      try {
        const found = await options.sheets.findEmail(emailCheck.email);
        if (found) {
          duplicate = true;
          signupId = found.signupId;
        } else {
          signupId = crypto.randomUUID();
          const row = {
            signup_id: signupId,
            email: emailCheck.email,
            created_at_utc: new Date(nowMs).toISOString(),
            source: config.source,
            privacy_notice_version: config.privacyNoticeVersion,
            marketing_opt_in: "false",
          };
          try {
            await options.sheets.append(row);
          } catch (err) {
            const recovered = await options.sheets.findEmail(emailCheck.email).catch(() => null);
            if (!recovered) return sheetFailure();
            duplicate = true;
            signupId = recovered.signupId;
          }
        }
      } catch (err) {
        return sheetFailure();
      }

      const issued = options.grants.issue(Math.floor(nowMs / 1000));
      const response = {
        ok: true,
        signupId,
        duplicate,
        marketingOptIn: false,
        outboundSending: "off",
        privacyNoticeVersion: config.privacyNoticeVersion,
        downloadToken: issued.token,
        downloadExpiresAt: issued.expiresAt,
        downloadPath: "/v1/guide",
      };
      const status = duplicate ? 200 : 201;
      await options.store.set(keyCheck.key, {
        bodyHash: hash,
        status,
        response,
        grantExpiresAtMs: Date.parse(issued.expiresAt),
        storedAtMs: nowMs,
      });
      return { status, json: response };
    });
  });
}

const DRIVE_PUBLIC_MESSAGE = "The guide file could not be read. No download was served.";

async function performDownload(options) {
  const nowSec = Math.floor(options.nowMs / 1000);
  const verdict = options.grants.verify(options.token, nowSec);
  if (!verdict.ok) {
    const status = verdict.reason === "not_configured" ? 503 : 401;
    return {
      status,
      json: { ok: false, error: verdict.reason, message: verdict.message },
    };
  }
  if (!captureConfigured(options.config)) {
    return {
      status: 503,
      json: {
        ok: false,
        error: "download_not_configured",
        message: "Download is not configured. No file was served.",
      },
    };
  }
  try {
    const file = await options.drive.openConfiguredPdf();
    return { status: 200, file };
  } catch (err) {
    const code = err && err.code ? err.code : "drive_unavailable";
    const status = code === "not_configured" ? 503 : 502;
    return {
      status,
      json: { ok: false, error: code, message: DRIVE_PUBLIC_MESSAGE },
    };
  }
}

module.exports = { performSignup, performDownload, bodyHash, DRIVE_PUBLIC_MESSAGE };
