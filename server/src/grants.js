"use strict";

const crypto = require("crypto");

const PURPOSE = "customer-recovery-pdf";

function signBody(secret, body) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

function createGrantCodec(secret, ttlSeconds) {
  const ttl = Number(ttlSeconds) > 0 ? Number(ttlSeconds) : 900;

  function issue(nowSec) {
    if (!secret || secret.length < 32) {
      const err = new Error("grant_secret_missing");
      err.code = "grant_secret_missing";
      throw err;
    }
    const payload = {
      v: 1,
      purpose: PURPOSE,
      iat: nowSec,
      exp: nowSec + ttl,
      jti: crypto.randomBytes(16).toString("base64url"),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const token = body + "." + signBody(secret, body);
    return {
      token,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      payload,
    };
  }

  function verify(token, nowSec) {
    if (!secret || secret.length < 32) {
      return { ok: false, reason: "not_configured", message: "Download is not configured. No file was served." };
    }
    if (typeof token !== "string" || token.length < 20 || token.length > 2000) {
      return { ok: false, reason: "malformed", message: "This download token is not valid." };
    }
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return { ok: false, reason: "malformed", message: "This download token is not valid." };
    }
    const expected = signBody(secret, parts[0]);
    const got = Buffer.from(parts[1]);
    const exp = Buffer.from(expected);
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
      return { ok: false, reason: "tampered", message: "This download token is not valid." };
    }
    let payload;
    try {
      payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    } catch (err) {
      return { ok: false, reason: "malformed", message: "This download token is not valid." };
    }
    if (!payload || payload.v !== 1 || payload.purpose !== PURPOSE) {
      return { ok: false, reason: "wrong_purpose", message: "This download token is not valid." };
    }
    if (payload.email || payload.fileId || payload.driveFileId) {
      return { ok: false, reason: "malformed", message: "This download token is not valid." };
    }
    if (typeof payload.iat !== "number" || payload.iat > nowSec + 60) {
      return { ok: false, reason: "malformed", message: "This download token is not valid." };
    }
    if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
      return { ok: false, reason: "expired", message: "This download token has expired." };
    }
    return { ok: true, payload };
  }

  return { issue, verify, purpose: PURPOSE, ttlSeconds: ttl };
}

module.exports = { createGrantCodec, PURPOSE };
