"use strict";

const path = require("path");

/** Existing account that owns the private PDF and the signup sheet. Not a new account. */
const OWNER_ACCOUNT = "navarretteroger@gmail.com";

const SHEET_ID_DEFAULT = "1RXBQl4KQU-FUOLBmL6iXjy3mcaIzw8Xl5n5vVtcbRVw";
const SHEET_TAB_DEFAULT = "Customer Recovery \u2014 Landing Page Signups";
const SHEET_GID_DEFAULT = "389366344";
const DRIVE_FILE_ID_DEFAULT = "1508Lh4WrwEcHKeFOx0RFm_cOSwbiHEgh";
const PRIVACY_NOTICE_VERSION = "2026-11-06";
const SOURCE_LABEL = "genlaunch-landing";
const PAGES_ORIGIN = "https://navarretteroger.github.io";

const REQUIRED_HEADERS = Object.freeze([
  "signup_id",
  "email",
  "created_at_utc",
  "source",
  "privacy_notice_version",
  "marketing_opt_in",
]);

const OAUTH_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
]);

function loadConfig(env) {
  const source = env || process.env;
  const allowedOrigins = String(source.ALLOWED_ORIGINS || PAGES_ORIGIN)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const grantSecret = source.GRANT_SIGNING_SECRET || "";

  return {
    host: source.HOST || "0.0.0.0",
    port: Number(source.PORT || 8080),
    trustProxy: source.TRUST_PROXY === "true",
    allowedOrigins,
    pagesOrigin: PAGES_ORIGIN,
    ownerAccount: OWNER_ACCOUNT,
    googleClientId: source.GOOGLE_OAUTH_CLIENT_ID || "",
    googleClientSecret: source.GOOGLE_OAUTH_CLIENT_SECRET || "",
    googleRefreshToken: source.GOOGLE_OAUTH_REFRESH_TOKEN || "",
    ignoredApplicationCredentials: Boolean(source.GOOGLE_APPLICATION_CREDENTIALS),
    sheetId: source.GOOGLE_SHEET_ID || SHEET_ID_DEFAULT,
    sheetTab: source.GOOGLE_SHEET_TAB || SHEET_TAB_DEFAULT,
    sheetGid: String(source.GOOGLE_SHEET_GID || SHEET_GID_DEFAULT),
    driveFileId: source.DRIVE_FILE_ID || DRIVE_FILE_ID_DEFAULT,
    grantSecret,
    grantTtlSeconds: Number(source.GRANT_TTL_SECONDS || 900),
    privacyNoticeVersion: source.PRIVACY_NOTICE_VERSION || PRIVACY_NOTICE_VERSION,
    source: source.SOURCE_LABEL || SOURCE_LABEL,
    supportContact: source.SUPPORT_CONTACT || "",
    idempotencyMode: source.IDEMPOTENCY_STORE === "memory" ? "memory" : "file",
    idempotencyPath:
      source.IDEMPOTENCY_PATH || path.join(__dirname, "..", "data", "idempotency.json"),
    rateLimitSignupPerMinute: Number(source.RATE_LIMIT_SIGNUP_PER_MINUTE || 8),
    rateLimitDownloadPerMinute: Number(source.RATE_LIMIT_DOWNLOAD_PER_MINUTE || 20),
    requiredHeaders: REQUIRED_HEADERS,
    oauthScopes: OAUTH_SCOPES,
    outboundSending: "off",
  };
}

function missingSecretNames(config) {
  const missing = [];
  if (!config.googleClientId) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!config.googleClientSecret) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!config.googleRefreshToken) missing.push("GOOGLE_OAUTH_REFRESH_TOKEN");
  if (!config.grantSecret || config.grantSecret.length < 32) missing.push("GRANT_SIGNING_SECRET");
  return missing;
}

function captureConfigured(config) {
  return missingSecretNames(config).length === 0 && Boolean(config.sheetId && config.sheetTab && config.driveFileId);
}

module.exports = {
  OWNER_ACCOUNT,
  SHEET_ID_DEFAULT,
  SHEET_TAB_DEFAULT,
  SHEET_GID_DEFAULT,
  DRIVE_FILE_ID_DEFAULT,
  PRIVACY_NOTICE_VERSION,
  SOURCE_LABEL,
  PAGES_ORIGIN,
  REQUIRED_HEADERS,
  OAUTH_SCOPES,
  loadConfig,
  missingSecretNames,
  captureConfigured,
};
