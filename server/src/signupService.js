"use strict";

const crypto = require("crypto");
const { captureConfigured } = require("./config");
const { validateEmail, validateIdempotencyKey, marketingOptInRejected, honeypotFilled } = require("./validate");
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

function publicSuccess(config, issued, ttlSeconds) {
  return {
    ok: true,
    marketingOptIn: false,
    outboundSending: "off",
    privacyNoticeVersion: config.privacyNoticeVersion,
    downloadToken: issued.token,
    downloadExpiresAt: issued.expiresAt,
    downloadPath: "/v1/guide",
    downloadTtlSeconds: ttlSeconds || config.grantTtlSeconds,
  };
}

async function appendOrReconcile(sheets, row) {
  try {
    await sheets.append(row);
    return true;
  } catch (err) {
    const seen = await sheets.findSignupId(row.signup_id).catch(() => null);
    if (seen) return true;
    if (err && err.code === "sheet_unauthorized" && typeof sheets.invalidateAuth === "function") {
      sheets.invalidateAuth();
      try {
        await sheets.append(row);
        return true;
      } catch (retryErr) {
        const seenAfter = await sheets.findSignupId(row.signup_id).catch(() => null);
        if (seenAfter) return true;
        throw retryErr;
      }
    }
    throw err;
  }
}

async function performSignup(options) {
  const config = options.config;
  const body = options.body && typeof options.body === "object" ? options.body : {};
  const nowMs = options.nowMs;
  const lock = options.lock;

  if (!captureConfigured(config) || !options.store || options.store.durable !== true) {
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

  if (honeypotFilled(body)) {
    return {
      status: 400,
      json: { ok: false, error: "invalid_request", message: "Submit the form again." },
    };
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

  try {
    return await lock.run("idem:" + keyCheck.key, async () => {
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
        try {
          const found = await options.sheets.findEmail(emailCheck.email);
          if (!found) {
            const row = {
              signup_id: crypto.randomUUID(),
              email: emailCheck.email,
              created_at_utc: new Date(nowMs).toISOString(),
              source: config.source,
              privacy_notice_version: config.privacyNoticeVersion,
              marketing_opt_in: "false",
            };
            await appendOrReconcile(options.sheets, row);
          }
        } catch (err) {
          if (err && err.code === "lock_capacity") {
            return {
              status: 503,
              json: { ok: false, error: "busy", message: messages.SAVE_FAILED },
            };
          }
          return sheetFailure();
        }

        const issued = options.grants.issue(Math.floor(nowMs / 1000));
        const response = publicSuccess(config, issued, options.grants.ttlSeconds);
        await options.store.set(keyCheck.key, {
          bodyHash: hash,
          status: 200,
          response,
          grantExpiresAtMs: Date.parse(issued.expiresAt),
          storedAtMs: nowMs,
        });
        return { status: 200, json: response };
      });
    });
  } catch (err) {
    if (err && err.code === "lock_capacity") {
      return {
        status: 503,
        json: { ok: false, error: "busy", message: messages.SAVE_FAILED },
      };
    }
    return sheetFailure();
  }
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
    const file = await options.drive.openConfiguredPdf({ signal: options.signal });
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

module.exports = { performSignup, performDownload, bodyHash, publicSuccess, DRIVE_PUBLIC_MESSAGE };
