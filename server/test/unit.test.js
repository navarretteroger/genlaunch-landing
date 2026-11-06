"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const messages = require("../src/messages");
const clientValidators = require("../../js/validators");
const { validateEmail, marketingOptInRejected, validateIdempotencyKey } = require("../src/validate");
const { sanitizeCell } = require("../src/sanitize");
const { createGrantCodec } = require("../src/grants");
const { loadConfig, captureConfigured, missingSecretNames, SHEET_TAB_DEFAULT, SHEET_ID_DEFAULT, SHEET_GID_DEFAULT, DRIVE_FILE_ID_DEFAULT, REQUIRED_HEADERS } = require("../src/config");
const { summarizeRequest, hasSensitiveQuery } = require("../src/redact");
const { clientIp, createRateLimiter } = require("../src/rateLimit");
const { MemoryIdempotencyStore, FileIdempotencyStore } = require("../src/idempotency");
const { followUpPolicy, sendFollowUp } = require("../src/followUpPolicy");
const { buildConsentUrl, REDIRECT_URI } = require("../src/oauthSetup");
const { OAUTH_SCOPES, OWNER_ACCOUNT } = require("../src/config");
const { quoteTab } = require("../src/sheets");
const { SECRET } = require("../src/testHelpers");

test("spec validation messages match between server and browser helpers", () => {
  assert.equal(clientValidators.EMPTY_EMAIL, messages.EMPTY_EMAIL);
  assert.equal(clientValidators.INVALID_EMAIL, messages.INVALID_EMAIL);
  assert.equal(clientValidators.IN_FLIGHT, messages.IN_FLIGHT);
  assert.equal(clientValidators.PREVIEW_SUBMIT, messages.PREVIEW_SUBMIT);
  assert.equal(clientValidators.SAVE_FAILED, messages.SAVE_FAILED);
  assert.equal(messages.EMPTY_EMAIL, "Enter your work email to continue.");
  assert.equal(messages.INVALID_EMAIL, "Enter a valid email address (for example, you@yourshop.com).");
  assert.equal(messages.PREVIEW_SUBMIT, "Thanks\u2014this is a preview. Nothing was stored and no PDF download was fulfilled.");
});

test("valid, empty, and invalid email", () => {
  assert.equal(validateEmail(" You@YourShop.com ").ok, true);
  assert.equal(validateEmail(" You@YourShop.com ").email, "you@yourshop.com");
  assert.equal(validateEmail("   ").message, messages.EMPTY_EMAIL);
  assert.equal(validateEmail("not-an-email").message, messages.INVALID_EMAIL);
  assert.equal(validateEmail("a@b").message, messages.INVALID_EMAIL);
  assert.equal(validateEmail("a b@shop.com").message, messages.INVALID_EMAIL);
  assert.equal(validateEmail("a@shop.com\n").message, messages.INVALID_EMAIL);
  const fields = clientValidators.validateCaptureFields({ email: "" });
  assert.equal(fields.errors.email, messages.EMPTY_EMAIL);
  const bad = clientValidators.validateCaptureFields({ email: "nope" });
  assert.equal(bad.errors.email, messages.INVALID_EMAIL);
  assert.equal(clientValidators.validateCaptureFields({ email: "you@yourshop.com" }).ok, true);
});

test("optional first-name rules stay available and are not required by default", () => {
  const missing = clientValidators.validateCaptureFields({ email: "a@b.co", firstName: "" }, { requireFirstName: true });
  assert.equal(missing.errors.firstName, messages.EMPTY_FIRST_NAME);
  const longName = "a".repeat(41);
  const long = clientValidators.validateCaptureFields({ email: "a@b.co", firstName: longName }, { requireFirstName: true });
  assert.equal(long.errors.firstName, messages.LONG_FIRST_NAME);
  assert.equal(clientValidators.validateCaptureFields({ email: "a@b.co", firstName: "" }).ok, true);
});

test("marketing opt-in true is rejected and absent or false is not", () => {
  assert.equal(marketingOptInRejected({ marketingOptIn: true }), true);
  assert.equal(marketingOptInRejected({ marketing_opt_in: "true" }), true);
  assert.equal(marketingOptInRejected({ marketingOptIn: false }), false);
  assert.equal(marketingOptInRejected({ email: "a@b.co" }), false);
});

test("formula-like cells are neutralized", () => {
  assert.equal(sanitizeCell("=cmd@shop.com"), "'=cmd@shop.com");
  assert.equal(sanitizeCell("+ops@shop.com"), "'+ops@shop.com");
  assert.equal(sanitizeCell("-1@shop.com"), "'-1@shop.com");
  assert.equal(sanitizeCell("@shop"), "'@shop");
  assert.equal(sanitizeCell("you@yourshop.com"), "you@yourshop.com");
  assert.equal(sanitizeCell("false"), "false");
});

test("grants expire, reject tampering, and omit email and file id", () => {
  const grants = createGrantCodec(SECRET, 900);
  const issued = grants.issue(1_700_000_000);
  const decoded = JSON.parse(Buffer.from(issued.token.split(".")[0], "base64url").toString("utf8"));
  assert.deepEqual(Object.keys(decoded).sort(), ["exp", "iat", "jti", "purpose", "v"]);
  assert.equal(decoded.purpose, "customer-recovery-pdf");
  assert.equal(grants.verify(issued.token, 1_700_000_100).ok, true);
  assert.equal(grants.verify(issued.token, 1_700_000_900).reason, "expired");
  const tampered = issued.token.slice(0, -1) + (issued.token.endsWith("a") ? "b" : "a");
  assert.equal(grants.verify(tampered, 1_700_000_100).reason, "tampered");
  assert.equal(grants.verify("nope", 1_700_000_100).reason, "malformed");
  const other = createGrantCodec("another-test-secret-not-real-32b!!", 900);
  assert.equal(other.verify(issued.token, 1_700_000_100).reason, "tampered");
});

test("short grant secret is not configured", () => {
  const config = loadConfig({ GRANT_SIGNING_SECRET: "short", GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y", GOOGLE_OAUTH_REFRESH_TOKEN: "z" });
  assert.equal(captureConfigured(config), false);
  assert.ok(missingSecretNames(config).includes("GRANT_SIGNING_SECRET"));
  assert.equal(createGrantCodec("short", 900).verify("abc.def", 10).reason, "not_configured");
});

test("outbound cannot be enabled from the environment", () => {
  const config = loadConfig({ OUTBOUND_SENDING: "on" });
  assert.equal(config.outboundSending, "off");
  assert.equal(followUpPolicy.outboundSending, "off");
  assert.equal(followUpPolicy.status, "pending");
  assert.equal(followUpPolicy.sendsFromThisBuild, 0);
  assert.throws(() => sendFollowUp(), /outbound_sending_off/);
});

test("service-account credentials are ignored", () => {
  const config = loadConfig({ GOOGLE_APPLICATION_CREDENTIALS: "/tmp/does-not-exist-sa.json" });
  assert.equal(config.ignoredApplicationCredentials, true);
  assert.equal(config.googleRefreshToken, "");
  assert.equal(captureConfigured(config), false);
});

test("sheet defaults match the confirmed owner-only sheet", () => {
  const config = loadConfig({});
  assert.equal(config.sheetId, SHEET_ID_DEFAULT);
  assert.equal(config.sheetId, "1RXBQl4KQU-FUOLBmL6iXjy3mcaIzw8Xl5n5vVtcbRVw");
  assert.equal(config.sheetTab, SHEET_TAB_DEFAULT);
  assert.ok(config.sheetTab.includes("\u2014"));
  assert.equal(config.sheetGid, SHEET_GID_DEFAULT);
  assert.equal(config.driveFileId, DRIVE_FILE_ID_DEFAULT);
  assert.deepEqual(config.requiredHeaders, REQUIRED_HEADERS);
  assert.equal(config.ownerAccount, "navarretteroger@gmail.com");
});

test("request logs keep the path and drop the query", () => {
  const summary = summarizeRequest({
    method: "GET",
    url: "/v1/guide?grant=super-secret-token&email=person@shop.com",
  }, 400);
  assert.deepEqual(summary, { method: "GET", path: "/v1/guide", status: 400 });
  assert.equal(JSON.stringify(summary).includes("super-secret-token"), false);
  assert.equal(JSON.stringify(summary).includes("person@shop.com"), false);
  assert.equal(hasSensitiveQuery("/v1/guide?token=abc"), true);
  assert.equal(hasSensitiveQuery("/healthz"), false);
});

test("client IP trusts X-Forwarded-For only when configured", () => {
  const req = { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" }, socket: { remoteAddress: "127.0.0.1" } };
  assert.equal(clientIp(req, false), "127.0.0.1");
  assert.equal(clientIp(req, true), "203.0.113.5");
});

test("rate limiter blocks the third call in a minute", () => {
  let now = 1_000_000;
  const limiter = createRateLimiter({ signupPerMinute: 2, downloadPerMinute: 2, now: () => now });
  assert.equal(limiter.signup("1.1.1.1").ok, true);
  assert.equal(limiter.signup("1.1.1.1").ok, true);
  const blocked = limiter.signup("1.1.1.1");
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("file idempotency store keeps the token off the email", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genlaunch-idem-"));
  const store = new FileIdempotencyStore(path.join(dir, "idem.json"));
  await store.set("key-1", {
    bodyHash: "abc",
    response: { downloadToken: "signed-token-value", signupId: "id-1" },
    storedAtMs: Date.now(),
  });
  const got = await store.get("key-1");
  assert.equal(got.response.downloadToken, "signed-token-value");
  const raw = fs.readFileSync(path.join(dir, "idem.json"), "utf8");
  assert.equal(raw.includes("person@shop.com"), false);
  const memory = new MemoryIdempotencyStore();
  await memory.set("k", { response: { downloadToken: "t" } });
  assert.equal((await memory.get("k")).response.downloadToken, "t");
});

test("owner consent URL requests Sheets and Drive read on the existing account", () => {
  const url = new URL(buildConsentUrl({ clientId: "test-client-id" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("login_hint"), OWNER_ACCOUNT);
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("include_granted_scopes"), "false");
  const scope = url.searchParams.get("scope");
  OAUTH_SCOPES.forEach((item) => assert.ok(scope.includes(item)));
  assert.equal(scope.includes("gmail"), false);
  assert.equal(scope.includes("drive.file"), false);
  assert.equal(url.toString().includes("service_account"), false);
});

test("sheet tab quoting preserves the em dash", () => {
  assert.equal(quoteTab(SHEET_TAB_DEFAULT), "'" + SHEET_TAB_DEFAULT + "'");
});

test("idempotency keys and submit controller", () => {
  assert.equal(validateIdempotencyKey("short").ok, false);
  assert.equal(validateIdempotencyKey("a".repeat(20)).ok, true);
  const keys = ["k-1", "k-2", "k-3"];
  let n = 0;
  const controller = clientValidators.createSubmitController({
    createKey: () => keys[n++],
  });
  const first = controller.begin();
  assert.equal(first.idempotencyKey, "k-1");
  assert.equal(controller.begin().ok, false);
  assert.equal(controller.begin().message, messages.IN_FLIGHT);
  controller.fail();
  assert.equal(controller.begin().idempotencyKey, "k-1");
  controller.fail();
  controller.rotateKey();
  assert.equal(controller.begin().idempotencyKey, "k-2");
  controller.succeed();
  assert.equal(controller.begin().idempotencyKey, "k-3");
});

test("frontend protocol refuses success without a token and omits email from session", () => {
  assert.equal(clientValidators.interpretSignupResponse(201, { ok: true }).ok, false);
  assert.equal(clientValidators.interpretSignupResponse(503, { ok: false, message: messages.PREVIEW_SUBMIT }).message, messages.PREVIEW_SUBMIT);
  const record = clientValidators.buildSessionRecord("https://api.example", {
    downloadToken: "tok",
    downloadExpiresAt: "2099-01-01T00:00:00.000Z",
    duplicate: false,
    signupId: "id",
    email: "person@shop.com",
    privacyNoticeVersion: "2026-11-06",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(record, "email"), false);
  assert.equal(record.downloadToken, "tok");
  const preview = clientValidators.canActivateDownload({ DELIVERY_MODE: "preview", CAPTURE_API_BASE: "https://api.example" }, record, Date.now());
  assert.equal(preview.ok, false);
  const ready = clientValidators.canActivateDownload(
    { DELIVERY_MODE: "production", CAPTURE_API_BASE: "https://api.example" },
    record,
    Date.parse("2098-01-01T00:00:00.000Z")
  );
  assert.equal(ready.ok, true);
  const expired = clientValidators.canActivateDownload(
    { DELIVERY_MODE: "production", CAPTURE_API_BASE: "https://api.example" },
    record,
    Date.parse("2100-01-01T00:00:00.000Z")
  );
  assert.equal(expired.reason, "expired");
});
