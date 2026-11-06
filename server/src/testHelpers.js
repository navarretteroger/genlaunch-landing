"use strict";

const crypto = require("crypto");
const { Readable } = require("stream");
const { loadConfig } = require("./config");
const { createGrantCodec } = require("./grants");
const { MemoryIdempotencyStore } = require("./idempotency");
const { KeyLock } = require("./lock");
const { createApp } = require("./app");

const SECRET = "test-grant-secret-not-real-32bytes!!";

function configuredEnv(over) {
  return Object.assign(
    {
      GOOGLE_OAUTH_CLIENT_ID: "test-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret",
      GOOGLE_OAUTH_REFRESH_TOKEN: "test-refresh-token",
      GRANT_SIGNING_SECRET: SECRET,
      SUPPORT_CONTACT: "deletion-contact-test-fixture@example.com",
      ALLOWED_ORIGINS: "https://navarretteroger.github.io",
      RATE_LIMIT_SIGNUP_PER_MINUTE: "40",
      RATE_LIMIT_DOWNLOAD_PER_MINUTE: "40",
      GLOBAL_SIGNUP_PER_HOUR: "1000",
      GLOBAL_DOWNLOAD_PER_HOUR: "1000",
      IDEMPOTENCY_STORE: "memory",
    },
    over || {}
  );
}

function createMockSheets() {
  const rows = [];
  let failAppend = false;
  let findOverride = null;
  const calls = { append: 0, find: 0 };
  return {
    rows,
    calls,
    setFailAppend(value) {
      failAppend = value;
    },
    setFindOverride(fn) {
      findOverride = fn;
    },
    async findEmail(email) {
      calls.find += 1;
      if (findOverride) return findOverride(email, calls.find, rows);
      const found = rows.find((row) => row.email === email);
      return found ? { signupId: found.signup_id, email: found.email } : null;
    },
    async findSignupId(signupId) {
      const found = rows.find((row) => row.signup_id === signupId);
      return found ? { signupId: found.signup_id } : null;
    },
    invalidateAuth() {},
    async append(row) {
      calls.append += 1;
      if (failAppend) {
        const err = new Error("sheet_unavailable");
        err.code = failAppend === "unauthorized" ? "sheet_unauthorized" : "sheet_unavailable";
        throw err;
      }
      rows.push(Object.assign({}, row));
      return { appended: true };
    },
  };
}

function createMockDrive(bytes) {
  const payload = bytes || Buffer.from("%PDF-1.4\n%mock-guide\n");
  const state = { mode: "ok", calls: 0 };
  return {
    state,
    payload,
    async openConfiguredPdf() {
      state.calls += 1;
      if (state.mode !== "ok") {
        const err = new Error(state.mode);
        err.code = state.mode;
        throw err;
      }
      return {
        stream: Readable.from([payload]),
        contentType: "application/pdf",
        contentLength: payload.length,
      };
    },
  };
}

function jsonResponse(status, obj, extraHeaders) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(extraHeaders || {}),
    json: async () => obj,
    text: async () => JSON.stringify(obj),
    body: null,
  };
}

function pdfResponse(status, headers, body) {
  const buf = body || Buffer.alloc(0);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers || {}),
    body: buf.length ? Readable.toWeb(Readable.from([buf])) : Readable.toWeb(Readable.from([])),
    json: async () => ({}),
    text: async () => buf.toString("utf8"),
  };
}

async function withServer(options, fn) {
  const logs = [];
  const app = createApp(Object.assign({ log: (entry) => logs.push(entry) }, options));
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const port = app.address().port;
  try {
    return await fn({ base: "http://127.0.0.1:" + port, logs });
  } finally {
    await new Promise((resolve, reject) => app.close((err) => (err ? reject(err) : resolve())));
  }
}

function idempotencyKey() {
  return crypto.randomUUID();
}

module.exports = {
  SECRET,
  configuredEnv,
  createMockSheets,
  createMockDrive,
  jsonResponse,
  pdfResponse,
  withServer,
  idempotencyKey,
  loadConfig,
  createGrantCodec,
  MemoryIdempotencyStore,
  KeyLock,
};
