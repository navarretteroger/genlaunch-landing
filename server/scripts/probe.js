#!/usr/bin/env node
"use strict";

/**
 * Manual readiness probe. Refreshes the owner token and reads the signup
 * sheet's tab and header row. Does not download the PDF and does not print
 * tokens, emails, or sheet rows.
 */
const { loadConfig, secretsPresent, missingSecretNames } = require("../src/config");
const { OwnerOAuth } = require("../src/oauth");
const { createSheetsClient } = require("../src/sheets");

async function main() {
  const config = loadConfig();
  if (!secretsPresent(config)) {
    console.log(JSON.stringify({
      googleAuth: "not_configured",
      sheets: "not_configured",
      missing: missingSecretNames(config),
      pdfDownload: "not_run",
    }));
    process.exit(2);
  }
  const auth = new OwnerOAuth({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    refreshToken: config.googleRefreshToken,
    fetchImpl: globalThis.fetch,
    timeoutMs: config.googleTimeoutMs,
  });
  try {
    await auth.getAccessToken();
  } catch (err) {
    console.log(JSON.stringify({
      googleAuth: "fail",
      sheets: "not_probed",
      code: err && err.code ? err.code : "oauth_refresh_failed",
      pdfDownload: "not_run",
    }));
    process.exit(1);
  }
  const sheets = createSheetsClient({ config, fetchImpl: globalThis.fetch, auth });
  try {
    await sheets.assertReady();
  } catch (err) {
    console.log(JSON.stringify({
      googleAuth: "ok",
      sheets: "fail",
      code: err && err.code ? err.code : "sheet_unavailable",
      pdfDownload: "not_run",
    }));
    process.exit(1);
  }
  console.log(JSON.stringify({ googleAuth: "ok", sheets: "ok", pdfDownload: "not_run" }));
}

main().catch((err) => {
  console.log(JSON.stringify({ googleAuth: "fail", sheets: "fail", code: err && err.code ? err.code : "probe_failed", pdfDownload: "not_run" }));
  process.exit(1);
});
