"use strict";

const http = require("http");
const { loadConfig, captureConfigured } = require("./config");
const { createGrantCodec } = require("./grants");
const { createSheetsClient } = require("./sheets");
const { createDriveClient } = require("./drive");
const { MemoryIdempotencyStore } = require("./idempotency");
const { createRateLimiter, clientIp } = require("./rateLimit");
const { KeyLock } = require("./lock");
const { hasSensitiveQuery, summarizeRequest } = require("./redact");
const { performSignup, performDownload } = require("./signupService");
const { followUpPolicy } = require("./followUpPolicy");

function isJsonContentType(header) {
  if (!header || typeof header !== "string") return false;
  return header.split(";")[0].trim().toLowerCase() === "application/json";
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        const err = new Error("too_large");
        err.code = "too_large";
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function securityHeaders() {
  return {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

function createApp(options) {
  const settings = options || {};
  const config = settings.config || loadConfig();
  const fetchImpl = settings.fetchImpl || globalThis.fetch;
  const now = settings.now || Date.now;
  const grants = settings.grants || createGrantCodec(config.grantSecret, config.grantTtlSeconds);
  const sheets = settings.sheets || createSheetsClient({ config, fetchImpl, now });
  const drive = settings.drive || createDriveClient({ config, fetchImpl, now });
  const store = settings.store || new MemoryIdempotencyStore();
  const limiter =
    settings.limiter ||
    createRateLimiter({
      signupPerMinute: config.rateLimitSignupPerMinute,
      downloadPerMinute: config.rateLimitDownloadPerMinute,
      now,
    });
  const lock = settings.lock || new KeyLock();
  const log = settings.log || ((entry) => console.log(JSON.stringify(entry)));

  function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return { ok: true };
    if (!config.allowedOrigins.includes(origin)) return { ok: false };
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, Accept");
    res.setHeader("Access-Control-Max-Age", "600");
    return { ok: true };
  }

  function sendJson(res, status, payload) {
    const body = payload == null ? "" : JSON.stringify(payload);
    res.writeHead(status, Object.assign(securityHeaders(), {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
    }));
    res.end(body);
  }

  function sendEmpty(res, status) {
    res.writeHead(status, securityHeaders());
    res.end();
  }

  const server = http.createServer(async (req, res) => {
    let statusCode = 500;
    let logged = false;
    function logOnce() {
      if (logged) return;
      logged = true;
      log(summarizeRequest(req, statusCode || res.statusCode));
    }
    res.on("finish", logOnce);
    res.on("close", logOnce);
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (hasSensitiveQuery(req.url)) {
        statusCode = 400;
        sendJson(res, 400, {
          ok: false,
          error: "sensitive_query_rejected",
          message: "Send the download token in the Authorization header, not the URL.",
        });
        return;
      }

      const cors = applyCors(req, res);
      if (!cors.ok) {
        statusCode = 403;
        sendJson(res, 403, {
          ok: false,
          error: "origin_not_allowed",
          message: "This browser origin is not allowed to call the capture service.",
        });
        return;
      }

      if (req.method === "OPTIONS") {
        statusCode = 204;
        sendEmpty(res, 204);
        return;
      }

      if (req.method === "GET" && url.pathname === "/healthz") {
        statusCode = 200;
        sendJson(res, 200, {
          ok: true,
          service: "genlaunch-landing-api",
          authorizationMode: "owner-oauth",
          captureConfigured: captureConfigured(config),
          outboundSending: followUpPolicy.outboundSending,
          followUp: followUpPolicy.status,
          privacyNoticeVersion: config.privacyNoticeVersion,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/signups") {
        const limit = limiter.signup(clientIp(req, config.trustProxy));
        if (!limit.ok) {
          statusCode = 429;
          res.setHeader("Retry-After", String(limit.retryAfterSeconds));
          sendJson(res, 429, {
            ok: false,
            error: "rate_limited",
            message: "Too many requests. Wait and try again. Nothing was stored and no download was issued.",
          });
          return;
        }
        if (!isJsonContentType(req.headers["content-type"])) {
          statusCode = 415;
          sendJson(res, 415, { ok: false, error: "unsupported_media_type", message: "Submit the form again." });
          return;
        }
        let parsed;
        try {
          const raw = await readBody(req, 8192);
          parsed = raw ? JSON.parse(raw) : {};
        } catch (err) {
          statusCode = err && err.code === "too_large" ? 413 : 400;
          sendJson(res, statusCode, {
            ok: false,
            error: err && err.code === "too_large" ? "too_large" : "bad_json",
            message: "Submit the form again.",
          });
          return;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          statusCode = 400;
          sendJson(res, 400, { ok: false, error: "bad_json", message: "Submit the form again." });
          return;
        }
        const result = await performSignup({
          body: parsed,
          idempotencyKey: req.headers["idempotency-key"],
          config,
          sheets,
          grants,
          store,
          lock,
          nowMs: now(),
        });
        statusCode = result.status;
        sendJson(res, result.status, result.json);
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/guide") {
        const limit = limiter.download(clientIp(req, config.trustProxy));
        if (!limit.ok) {
          statusCode = 429;
          res.setHeader("Retry-After", String(limit.retryAfterSeconds));
          sendJson(res, 429, {
            ok: false,
            error: "rate_limited",
            message: "Too many download requests. Wait and try again. No file was served.",
          });
          return;
        }
        const header = req.headers.authorization || "";
        const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
        const token = match ? match[1] : "";
        const result = await performDownload({
          token,
          config,
          drive,
          grants,
          nowMs: now(),
        });
        if (!result.file) {
          statusCode = result.status;
          sendJson(res, result.status, result.json);
          return;
        }
        statusCode = 200;
        const headers = Object.assign(securityHeaders(), {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="Customer-Recovery-Guide.pdf"',
          "Cache-Control": "no-store, private",
        });
        if (result.file.contentLength != null) headers["Content-Length"] = String(result.file.contentLength);
        res.writeHead(200, headers);
        result.file.stream.on("error", () => {
          res.destroy();
        });
        result.file.stream.pipe(res);
        return;
      }

      statusCode = 404;
      sendJson(res, 404, { ok: false, error: "not_found", message: "Not found." });
    } catch (err) {
      statusCode = 500;
      log({ level: "error", code: err && err.code ? err.code : "internal" });
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: "internal", message: "The request could not be completed." });
      } else {
        res.destroy();
      }
    }
  });

  return server;
}

module.exports = { createApp, isJsonContentType, readBody };
