"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("stream");
const messages = require("../src/messages");
const { DRIVE_FILE_ID_DEFAULT, SHEET_ID_DEFAULT } = require("../src/config");
const { createGrantCodec } = require("../src/grants");
const {
  configuredEnv,
  loadConfig,
  createMockSheets,
  createMockDrive,
  withServer,
  idempotencyKey,
  MemoryIdempotencyStore,
  createGrantCodec: codec,
} = require("../src/testHelpers");

function stack(over) {
  const config = loadConfig(configuredEnv(over && over.env));
  const sheets = createMockSheets();
  const drive = createMockDrive(over && over.pdf);
  const store = new MemoryIdempotencyStore({ durable: over && over.durable === false ? false : true });
  const grants = codec(config.grantSecret, over && over.ttl ? over.ttl : config.grantTtlSeconds);
  return { config, sheets, drive, store, grants, now: over && over.now };
}

async function signup(base, body, key, origin) {
  const res = await fetch(base + "/v1/signups", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": key || idempotencyKey(),
      Origin: origin || "https://navarretteroger.github.io",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json, headers: res.headers };
}

test("end-to-end mock: persist, idempotent retry, duplicate email, then download bytes", async () => {
  const parts = stack();
  await withServer(parts, async ({ base, logs }) => {
    const key = idempotencyKey();
    const body = { email: " You@YourShop.com ", privacyNoticeVersion: "2026-11-06", source: "=evil", phone: "555" };
    const first = await signup(base, body, key);
    assert.equal(first.status, 200);
    assert.equal(first.json.ok, true);
    assert.equal(first.json.duplicate, undefined);
    assert.equal(first.json.signupId, undefined);
    assert.equal(first.json.marketingOptIn, false);
    assert.equal(first.json.downloadTtlSeconds, 900);
    assert.equal(first.json.outboundSending, "off");
    assert.equal(typeof first.json.downloadToken, "string");
    assert.equal(first.headers.get("access-control-allow-origin"), "https://navarretteroger.github.io");
    assert.equal(parts.sheets.calls.append, 1);
    assert.equal(parts.sheets.rows[0].email, "you@yourshop.com");
    assert.equal(parts.sheets.rows[0].marketing_opt_in, "false");
    assert.equal(parts.sheets.rows[0].source, "genlaunch-landing");
    assert.deepEqual(Object.keys(parts.sheets.rows[0]).sort(), [
      "created_at_utc",
      "email",
      "marketing_opt_in",
      "privacy_notice_version",
      "signup_id",
      "source",
    ]);
    assert.equal(JSON.stringify(parts.sheets.rows).includes("555"), false);

    const retry = await signup(base, { email: "you@yourshop.com", privacyNoticeVersion: "2026-11-06" }, key);
    assert.equal(retry.status, 200);
    assert.equal(retry.json.downloadToken, first.json.downloadToken);
    assert.equal(parts.sheets.calls.append, 1);

    const again = await signup(base, { email: "you@yourshop.com", privacyNoticeVersion: "2026-11-06" }, idempotencyKey());
    assert.equal(again.status, 200);
    assert.equal(again.json.duplicate, undefined);
    assert.equal(again.json.signupId, undefined);
    assert.notEqual(again.json.downloadToken, first.json.downloadToken);
    const shape = (json) => {
      const copy = Object.assign({}, json);
      delete copy.downloadToken;
      delete copy.downloadExpiresAt;
      return copy;
    };
    assert.deepEqual(shape(first.json), shape(again.json));
    assert.deepEqual(Object.keys(first.json).sort(), Object.keys(again.json).sort());
    assert.equal(parts.sheets.rows.length, 1);

    const download = await fetch(base + "/v1/guide", {
      headers: {
        Authorization: "Bearer " + first.json.downloadToken,
        Origin: "https://navarretteroger.github.io",
        Accept: "application/pdf",
      },
    });
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-type"), /application\/pdf/);
    assert.match(download.headers.get("content-disposition"), /attachment/);
    assert.equal(download.headers.get("location"), null);
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.equal(bytes.equals(parts.drive.payload), true);
    assert.equal(bytes.toString().includes("drive.google.com"), false);

    const secondDownload = await fetch(base + "/v1/guide", {
      headers: { Authorization: "Bearer " + first.json.downloadToken },
    });
    assert.equal(secondDownload.status, 200);
    await secondDownload.arrayBuffer();
    assert.equal(parts.drive.state.calls, 2);

    const leaked = JSON.stringify(logs);
    assert.equal(leaked.includes(first.json.downloadToken), false);
    assert.equal(leaked.includes("you@yourshop.com"), false);
  });
});

test("invalid email, missing key, and forged marketing opt-in do not write", async () => {
  const parts = stack();
  await withServer(parts, async ({ base }) => {
    const bad = await signup(base, { email: "not-an-email", privacyNoticeVersion: "2026-11-06" });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.message, messages.INVALID_EMAIL);
    assert.equal(bad.json.downloadToken, undefined);

    const empty = await signup(base, { email: "  ", privacyNoticeVersion: "2026-11-06" });
    assert.equal(empty.status, 400);
    assert.equal(empty.json.message, messages.EMPTY_EMAIL);

    const opted = await signup(base, {
      email: "a@b.co",
      privacyNoticeVersion: "2026-11-06",
      marketingOptIn: true,
    });
    assert.equal(opted.status, 400);
    assert.equal(opted.json.error, "marketing_opt_in_not_accepted");
    assert.equal(parts.sheets.calls.append, 0);
  });
});

test("sheet failure does not issue a download grant", async () => {
  const parts = stack();
  parts.sheets.setFailAppend(true);
  await withServer(parts, async ({ base }) => {
    const res = await signup(base, { email: "owner@shop.com", privacyNoticeVersion: "2026-11-06" });
    assert.equal(res.status, 503);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, "sheet_unavailable");
    assert.equal(res.json.message, messages.SAVE_FAILED);
    assert.equal(res.json.downloadToken, undefined);
    assert.equal(parts.sheets.rows.length, 0);
    assert.equal(parts.drive.state.calls, 0);
  });
});

test("unconfigured server does not pretend to capture or download", async () => {
  const sheets = createMockSheets();
  const drive = createMockDrive();
  const config = loadConfig({ IDEMPOTENCY_STORE: "memory" });
  await withServer({ config, sheets, drive }, async ({ base }) => {
    const health = await fetch(base + "/healthz");
    const healthJson = await health.json();
    assert.equal(healthJson.captureConfigured, false);
    assert.equal(healthJson.outboundSending, "off");
    assert.equal(healthJson.authorizationMode, "owner-oauth");
    const raw = JSON.stringify(healthJson);
    assert.equal(raw.includes(SHEET_ID_DEFAULT), false);
    assert.equal(raw.includes(DRIVE_FILE_ID_DEFAULT), false);
    assert.equal(raw.includes("test-refresh-token"), false);

    const res = await signup(base, { email: "a@b.co", privacyNoticeVersion: "2026-11-06" });
    assert.equal(res.status, 503);
    assert.equal(res.json.message, messages.PREVIEW_SUBMIT);
    assert.equal(res.json.downloadToken, undefined);
    assert.equal(sheets.calls.append, 0);

    const download = await fetch(base + "/v1/guide", { headers: { Authorization: "Bearer whatever-token" } });
    assert.equal(download.status, 503);
    const down = await download.json();
    assert.equal(down.ok, false);
    assert.equal(drive.state.calls, 0);
  });
});

test("expired and tampered grants and unauthorized Drive do not serve the file", async () => {
  let nowMs = Date.parse("2026-11-06T21:00:00.000Z");
  const parts = stack({ now: () => nowMs, ttl: 60 });
  await withServer(parts, async ({ base }) => {
    const ok = await signup(base, { email: "a@shop.com", privacyNoticeVersion: "2026-11-06" });
    assert.equal(ok.status, 200);
    const token = ok.json.downloadToken;

    nowMs += 61 * 1000;
    const expired = await fetch(base + "/v1/guide", { headers: { Authorization: "Bearer " + token } });
    const expiredJson = await expired.json();
    assert.equal(expired.status, 401);
    assert.equal(expiredJson.error, "expired");
    assert.match(expired.headers.get("content-type"), /json/);

    nowMs = Date.parse("2026-11-06T21:00:00.000Z");
    const fresh = await signup(base, { email: "b@shop.com", privacyNoticeVersion: "2026-11-06" });
    const tampered = fresh.json.downloadToken.slice(0, -1) + (fresh.json.downloadToken.endsWith("a") ? "b" : "a");
    const bad = await fetch(base + "/v1/guide", { headers: { Authorization: "Bearer " + tampered } });
    const badJson = await bad.json();
    assert.equal(bad.status, 401);
    assert.equal(badJson.error, "tampered");

    parts.drive.state.mode = "drive_unauthorized";
    const denied = await fetch(base + "/v1/guide", { headers: { Authorization: "Bearer " + fresh.json.downloadToken } });
    const deniedJson = await denied.json();
    assert.equal(denied.status, 502);
    assert.equal(deniedJson.ok, false);
    assert.equal(JSON.stringify(deniedJson).includes(DRIVE_FILE_ID_DEFAULT), false);
    assert.equal(JSON.stringify(deniedJson).includes("drive.google.com"), false);
    assert.equal(denied.headers.get("location"), null);

    parts.drive.state.mode = "drive_redirect_refused";
    const redirected = await fetch(base + "/v1/guide", { headers: { Authorization: "Bearer " + fresh.json.downloadToken } });
    assert.equal(redirected.status, 502);
    assert.equal(redirected.headers.get("location"), null);
    const redirectedJson = await redirected.json();
    assert.equal(JSON.stringify(redirectedJson).includes("drive.google.com"), false);
  });
});

test("token in the URL is rejected and is not written to the request log", async () => {
  const parts = stack();
  await withServer(parts, async ({ base, logs }) => {
    const res = await fetch(base + "/v1/guide?grant=super-secret-token&email=person@shop.com");
    const json = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.error, "sensitive_query_rejected");
    assert.equal(parts.drive.state.calls, 0);
    const lines = JSON.stringify(logs);
    assert.equal(lines.includes("super-secret-token"), false);
    assert.equal(lines.includes("person@shop.com"), false);
    assert.match(lines, /\/v1\/guide/);
  });
});

test("CORS allowlist is the Pages origin and not a wildcard", async () => {
  const parts = stack();
  await withServer(parts, async ({ base }) => {
    const preflight = await fetch(base + "/v1/signups", {
      method: "OPTIONS",
      headers: {
        Origin: "https://navarretteroger.github.io",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,idempotency-key",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://navarretteroger.github.io");
    assert.equal(preflight.headers.get("access-control-allow-origin").includes("*"), false);

    const evil = await fetch(base + "/v1/signups", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey(),
      },
      body: JSON.stringify({ email: "a@b.co", privacyNoticeVersion: "2026-11-06" }),
    });
    assert.equal(evil.status, 403);
    assert.equal(evil.headers.get("access-control-allow-origin"), null);
    assert.equal(parts.sheets.calls.append, 0);
  });
});

test("same idempotency key with a different email conflicts", async () => {
  const parts = stack();
  await withServer(parts, async ({ base }) => {
    const key = idempotencyKey();
    const first = await signup(base, { email: "one@shop.com", privacyNoticeVersion: "2026-11-06" }, key);
    assert.equal(first.status, 200);
    const conflict = await signup(base, { email: "two@shop.com", privacyNoticeVersion: "2026-11-06" }, key);
    assert.equal(conflict.status, 409);
    assert.equal(parts.sheets.rows.length, 1);
  });
});

test("parallel duplicate emails append once", async () => {
  const parts = stack();
  parts.sheets.setFindOverride(async (email, _call, rows) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const found = rows.find((row) => row.email === email);
    return found ? { signupId: found.signup_id, email: found.email } : null;
  });
  const originalAppend = parts.sheets.append.bind(parts.sheets);
  parts.sheets.append = async (row) => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return originalAppend(row);
  };
  await withServer(parts, async ({ base }) => {
    const results = await Promise.all([
      signup(base, { email: "dup@shop.com", privacyNoticeVersion: "2026-11-06" }, idempotencyKey()),
      signup(base, { email: "dup@shop.com", privacyNoticeVersion: "2026-11-06" }, idempotencyKey()),
    ]);
    assert.equal(parts.sheets.rows.length, 1);
    assert.equal(parts.sheets.calls.append, 1);
    const statuses = results.map((item) => item.status).sort();
    assert.deepEqual(statuses, [200, 200]);
    assert.equal(results.filter((item) => item.json.downloadToken).length, 2);
  });
});

test("signup rate limit does not write or grant after the cap", async () => {
  const parts = stack({ env: { RATE_LIMIT_SIGNUP_PER_MINUTE: "2" } });
  await withServer(parts, async ({ base }) => {
    const a = await signup(base, { email: "a@shop.com", privacyNoticeVersion: "2026-11-06" });
    const b = await signup(base, { email: "b@shop.com", privacyNoticeVersion: "2026-11-06" });
    const c = await signup(base, { email: "c@shop.com", privacyNoticeVersion: "2026-11-06" });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(c.status, 429);
    assert.equal(c.json.downloadToken, undefined);
    assert.equal(parts.sheets.rows.length, 2);
    assert.equal(c.headers.get("retry-after") != null, true);
  });
});

test("invalid and honeypot requests do not spend the shared signup allowance", async () => {
  const parts = stack({
    env: {
      GLOBAL_SIGNUP_PER_HOUR: "1",
      RATE_LIMIT_SIGNUP_PER_MINUTE: "40",
    },
  });
  await withServer(parts, async ({ base }) => {
    for (let i = 0; i < 8; i += 1) {
      const bad = await signup(base, { email: "not-an-email", privacyNoticeVersion: "2026-11-06" });
      assert.equal(bad.status, 400);
    }
    const trap = await signup(base, {
      email: "trap@shop.com",
      privacyNoticeVersion: "2026-11-06",
      company_website: "https://spam.example",
    });
    assert.equal(trap.status, 400);
    assert.equal(parts.sheets.calls.append, 0);
    const first = await signup(base, { email: "one@shop.com", privacyNoticeVersion: "2026-11-06" });
    assert.equal(first.status, 200);
    const second = await signup(base, { email: "two@shop.com", privacyNoticeVersion: "2026-11-06" });
    assert.equal(second.status, 429);
    assert.equal(second.json.downloadToken, undefined);
    assert.equal(parts.sheets.rows.length, 1);
  });
});

test("honeypot and missing Origin do not reveal whether an email is stored", async () => {
  const parts = stack();
  await withServer(parts, async ({ base }) => {
    const bot = await signup(base, {
      email: "bot@shop.com",
      privacyNoticeVersion: "2026-11-06",
      company_website: "https://spam.example",
    });
    assert.equal(bot.status, 400);
    assert.equal(bot.json.downloadToken, undefined);
    assert.equal(parts.sheets.calls.append, 0);

    const res = await fetch(base + "/v1/signups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey(),
      },
      body: JSON.stringify({ email: "direct@shop.com", privacyNoticeVersion: "2026-11-06" }),
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.signupId, undefined);
  });
});

test("nondurable idempotency refuses capture", async () => {
  const parts = stack({ durable: false });
  await withServer(parts, async ({ base }) => {
    const res = await signup(base, { email: "a@shop.com", privacyNoticeVersion: "2026-11-06" });
    assert.equal(res.status, 503);
    assert.equal(res.json.downloadToken, undefined);
    assert.equal(parts.sheets.calls.append, 0);
  });
});

test("ambiguous append is reconciled by signup id and a 401 is retried only after a miss", async () => {
  const parts = stack();
  let appends = 0;
  parts.sheets.findSignupId = async (signupId) => (appends === 1 ? null : { signupId });
  parts.sheets.append = async (row) => {
    appends += 1;
    if (appends === 1) {
      const err = new Error("sheet_unauthorized");
      err.code = "sheet_unauthorized";
      throw err;
    }
    parts.sheets.rows.push(row);
  };
  await withServer(parts, async ({ base }) => {
    const res = await signup(base, { email: "retry@shop.com", privacyNoticeVersion: "2026-11-06" });
    assert.equal(res.status, 200);
    assert.equal(appends, 2);
    assert.equal(res.json.signupId, undefined);
  });
});

test("real grant codec used by the server rejects a token minted with another secret", async () => {
  const parts = stack();
  const other = createGrantCodec("different-test-secret-not-real-32!", 900);
  const forged = other.issue(Math.floor(Date.now() / 1000)).token;
  await withServer(parts, async ({ base }) => {
    const res = await fetch(base + "/v1/guide", { headers: { Authorization: "Bearer " + forged } });
    const json = await res.json();
    assert.equal(res.status, 401);
    assert.equal(json.error, "tampered");
    assert.equal(parts.drive.state.calls, 0);
  });
});

test("download response is not a Drive redirect even when the mock stream is a web stream", async () => {
  const payload = Buffer.from("%PDF-1.4\nweb");
  const parts = stack({ pdf: payload });
  parts.drive.openConfiguredPdf = async () => ({
    stream: Readable.from([payload]),
    contentType: "application/pdf",
    contentLength: payload.length,
  });
  await withServer(parts, async ({ base }) => {
    const created = await signup(base, { email: "c@shop.com", privacyNoticeVersion: "2026-11-06" });
    const res = await fetch(base + created.json.downloadPath, {
      headers: { Authorization: "Bearer " + created.json.downloadToken },
    });
    assert.equal(res.status, 200);
    assert.equal(Buffer.from(await res.arrayBuffer()).equals(payload), true);
    assert.equal(String(res.headers.get("location") || "").includes("drive.google.com"), false);
  });
});
