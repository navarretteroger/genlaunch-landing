"use strict";

const { CodedError } = require("./errors");

/** Files Roger selected. These are not OAuth scopes. */
const SELECTED_SPREADSHEET_ID = "1RXBQl4KQU-FUOLBmL6iXjy3mcaIzw8Xl5n5vVtcbRVw";
const SELECTED_PDF_FILE_ID = "1508Lh4WrwEcHKeFOx0RFm_cOSwbiHEgh";

/** The only scope this app may request. It is per-file, not all Drive or all Sheets. */
const FILE_SCOPED_OAUTH_SCOPE = "https://www.googleapis.com/auth/drive.file";

const PROHIBITED_OAUTH_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.activity",
  "https://www.googleapis.com/auth/drive.activity.readonly",
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
]);

function scopeWideningError() {
  return new CodedError("oauth_scope_widening_refused");
}

function fileSelectionError() {
  return new CodedError("selected_file_override_refused");
}

function normalizeScopeList(scopes) {
  if (Array.isArray(scopes)) return scopes.map((item) => String(item).trim()).filter(Boolean);
  return String(scopes || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Consent may request only drive.file. A spreadsheets or drive.readonly
 * scope is account-wide and cannot be narrowed by a file id.
 */
function assertRequestedScopes(scopes) {
  const list = normalizeScopeList(scopes);
  const widened = list.some((scope) => PROHIBITED_OAUTH_SCOPES.indexOf(scope) !== -1);
  if (widened || list.length !== 1 || list[0] !== FILE_SCOPED_OAUTH_SCOPE) {
    throw scopeWideningError();
  }
  return Object.freeze(list.slice());
}

/**
 * The token response scope is the effective grant Google reports.
 * Missing, null, or any scope other than drive.file is refused.
 * Refusal does not revoke a grant Google already issued.
 */
function assessTokenGrant(json) {
  const base = { revokesProviderGrant: false };
  if (!json || typeof json.scope !== "string" || !json.scope.trim()) {
    return Object.assign(base, { ok: false, code: "oauth_scope_unverifiable" });
  }
  try {
    assertRequestedScopes(json.scope);
  } catch (err) {
    return Object.assign(base, { ok: false, code: "oauth_scope_widening_refused" });
  }
  return Object.assign(base, { ok: true, code: "oauth_scope_exact" });
}

function assertSelectedSpreadsheet(spreadsheetId) {
  if (spreadsheetId !== SELECTED_SPREADSHEET_ID) throw fileSelectionError();
  return SELECTED_SPREADSHEET_ID;
}

function assertSelectedPdf(fileId) {
  if (fileId !== SELECTED_PDF_FILE_ID) throw fileSelectionError();
  return SELECTED_PDF_FILE_ID;
}

function selectedFileAllowlist() {
  return Object.freeze({
    spreadsheetId: SELECTED_SPREADSHEET_ID,
    pdfFileId: SELECTED_PDF_FILE_ID,
  });
}

module.exports = {
  SELECTED_SPREADSHEET_ID,
  SELECTED_PDF_FILE_ID,
  FILE_SCOPED_OAUTH_SCOPE,
  PROHIBITED_OAUTH_SCOPES,
  assertRequestedScopes,
  assessTokenGrant,
  assertSelectedSpreadsheet,
  assertSelectedPdf,
  selectedFileAllowlist,
};
