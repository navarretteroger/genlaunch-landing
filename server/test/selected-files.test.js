"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig, assertRuntimeConfig } = require("../src/config");
const { buildConsentUrl, createPkce } = require("../src/oauthSetup");
const { OwnerOAuth } = require("../src/oauth");
const { createDriveClient } = require("../src/drive");
const { createSheetsClient } = require("../src/sheets");
const { evaluateOwnerPicks, decidePickerSave } = require("../src/pickerGrant");
const {
  FILE_SCOPED_OAUTH_SCOPE,
  SELECTED_SPREADSHEET_ID,
  SELECTED_PDF_FILE_ID,
  assertRequestedScopes,
  assessTokenGrant,
} = require("../src/selectedFiles");
const { configuredEnv, jsonResponse } = require("../src/testHelpers");

const EXPECTED = {
  spreadsheetId: SELECTED_SPREADSHEET_ID,
  pdfFileId: SELECTED_PDF_FILE_ID,
};

function consent(scopes) {
  const pkce = createPkce();
  return buildConsentUrl({
    clientId: "test-client-id",
    codeChallenge: pkce.challenge,
    state: pkce.state,
    scopes,
  });
}

test("requested scope stays exactly drive.file and rejects widening options", () => {
  assert.deepEqual(assertRequestedScopes(FILE_SCOPED_OAUTH_SCOPE), [FILE_SCOPED_OAUTH_SCOPE]);
  [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive",
    FILE_SCOPED_OAUTH_SCOPE + " https://www.googleapis.com/auth/spreadsheets",
    "",
    null,
  ].forEach((scopes) => {
    assert.throws(() => consent(scopes), /oauth_scope_widening_refused/);
  });
  const url = new URL(consent([FILE_SCOPED_OAUTH_SCOPE]));
  assert.equal(url.searchParams.get("scope"), FILE_SCOPED_OAUTH_SCOPE);
  assert.equal(url.searchParams.get("include_granted_scopes"), "false");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.throws(() => buildConsentUrl({
    clientId: "test-client-id",
    codeChallenge: "abc",
    state: "def",
    includeGrantedScopes: true,
  }), /oauth_scope_widening_refused/);
});

test("environment cannot widen scopes or retarget the selected files", () => {
  const ok = loadConfig(configuredEnv());
  assert.deepEqual(ok.oauthScopes, [FILE_SCOPED_OAUTH_SCOPE]);
  assert.equal(ok.sheetId, SELECTED_SPREADSHEET_ID);
  assert.equal(ok.driveFileId, SELECTED_PDF_FILE_ID);
  assert.doesNotThrow(() => assertRuntimeConfig(ok));
  assert.throws(
    () => loadConfig(configuredEnv({ GOOGLE_OAUTH_SCOPES: "https://www.googleapis.com/auth/spreadsheets" })),
    (err) => err.code === "oauth_scope_widening_refused"
  );
  assert.throws(
    () => loadConfig(configuredEnv({ GOOGLE_OAUTH_SCOPES: FILE_SCOPED_OAUTH_SCOPE + " https://www.googleapis.com/auth/drive.readonly" })),
    (err) => err.code === "oauth_scope_widening_refused"
  );
  assert.throws(
    () => loadConfig(configuredEnv({ GOOGLE_SHEET_ID: "not-the-selected-sheet" })),
    (err) => err.code === "selected_file_override_refused"
  );
  assert.throws(
    () => loadConfig(configuredEnv({ DRIVE_FILE_ID: "not-the-selected-pdf" })),
    (err) => err.code === "selected_file_override_refused"
  );
  ["", null, "not-the-selected-sheet"].forEach((sheetId) => {
    assert.throws(
      () => loadConfig(configuredEnv({ GOOGLE_SHEET_ID: sheetId })),
      (err) => err.code === "selected_file_override_refused"
    );
  });
  assert.throws(
    () => loadConfig(configuredEnv({ DRIVE_FILE_ID: null })),
    (err) => err.code === "selected_file_override_refused"
  );
});

test("empty PDF config is refused while the spreadsheet id stays selected", () => {
  assert.throws(
    () => loadConfig(configuredEnv({ DRIVE_FILE_ID: "" })),
    (err) => err.code === "selected_file_override_refused"
  );
  const sheetOnly = loadConfig(configuredEnv({ GOOGLE_SHEET_ID: SELECTED_SPREADSHEET_ID }));
  assert.equal(sheetOnly.sheetId, SELECTED_SPREADSHEET_ID);
  assert.equal(sheetOnly.driveFileId, SELECTED_PDF_FILE_ID);
});

test("returned token scope must be exactly drive.file or the token is refused", () => {
  assert.equal(assessTokenGrant({ scope: FILE_SCOPED_OAUTH_SCOPE }).ok, true);
  [
    {},
    { scope: null },
    { scope: "" },
    { scope: "   " },
    { scope: "https://www.googleapis.com/auth/spreadsheets" },
    { scope: FILE_SCOPED_OAUTH_SCOPE + " https://www.googleapis.com/auth/drive.readonly" },
  ].forEach((json) => {
    const verdict = assessTokenGrant(json);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.revokesProviderGrant, false);
  });
});

test("refresh does not use an omitted or broader returned scope", async () => {
  async function refresh(scope) {
    let calls = 0;
    const auth = new OwnerOAuth({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      refreshToken: "test-refresh-token",
      fetchImpl: async () => {
        calls += 1;
        const body = { access_token: "access-fixture", expires_in: 3600 };
        if (scope !== undefined) body.scope = scope;
        return jsonResponse(200, body);
      },
      now: () => 10_000,
    });
    try {
      await auth.getAccessToken();
      return { ok: true, calls };
    } catch (err) {
      return { ok: false, code: err.code, calls };
    }
  }
  const missing = await refresh(undefined);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "oauth_scope_unverifiable");
  const broad = await refresh("https://www.googleapis.com/auth/spreadsheets");
  assert.equal(broad.ok, false);
  assert.equal(broad.code, "oauth_scope_widening_refused");
  const exact = await refresh(FILE_SCOPED_OAUTH_SCOPE);
  assert.equal(exact.ok, true);
});

async function expectZeroGoogleCalls(makeClient, invoke) {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(200, { access_token: "should-not-be-requested", scope: FILE_SCOPED_OAUTH_SCOPE });
  };
  const client = makeClient(fetchImpl);
  await assert.rejects(invoke(client), (err) => err.code === "selected_file_override_refused");
  assert.equal(calls, 0);
}

test("drive client makes no token or API call for a wrong PDF id", async () => {
  const base = loadConfig(configuredEnv());
  await expectZeroGoogleCalls(
    (fetchImpl) => createDriveClient({
      config: Object.assign({}, base, { driveFileId: "different-pdf" }),
      fetchImpl,
      now: () => 10_000,
    }),
    (client) => client.openConfiguredPdf()
  );
});

test("drive client makes no token or API call for a null PDF id", async () => {
  const base = loadConfig(configuredEnv());
  await expectZeroGoogleCalls(
    (fetchImpl) => createDriveClient({
      config: Object.assign({}, base, { driveFileId: null }),
      fetchImpl,
      now: () => 10_000,
    }),
    (client) => client.openConfiguredPdf()
  );
});

test("drive client makes no token or API call for an empty PDF id", async () => {
  const base = loadConfig(configuredEnv());
  await expectZeroGoogleCalls(
    (fetchImpl) => createDriveClient({
      config: Object.assign({}, base, { driveFileId: "" }),
      fetchImpl,
      now: () => 10_000,
    }),
    (client) => client.openConfiguredPdf()
  );
});

test("sheets client makes no token or API call for a wrong spreadsheet id", async () => {
  const base = loadConfig(configuredEnv());
  await expectZeroGoogleCalls(
    (fetchImpl) => createSheetsClient({
      config: Object.assign({}, base, { sheetId: "different-sheet" }),
      fetchImpl,
      now: () => 10_000,
    }),
    (client) => client.findEmail("a@b.co")
  );
  await expectZeroGoogleCalls(
    (fetchImpl) => createSheetsClient({
      config: Object.assign({}, base, { sheetId: "different-sheet" }),
      fetchImpl,
      now: () => 10_000,
    }),
    (client) => client.append({ email: "a@b.co" })
  );
});

test("sheets client makes no token or API call for a null spreadsheet id", async () => {
  const base = loadConfig(configuredEnv());
  await expectZeroGoogleCalls(
    (fetchImpl) => createSheetsClient({
      config: Object.assign({}, base, { sheetId: null }),
      fetchImpl,
      now: () => 10_000,
    }),
    (client) => client.findEmail("a@b.co")
  );
});

test("sheets client makes no token or API call for an empty spreadsheet id", async () => {
  const base = loadConfig(configuredEnv());
  await expectZeroGoogleCalls(
    (fetchImpl) => createSheetsClient({
      config: Object.assign({}, base, { sheetId: "" }),
      fetchImpl,
      now: () => 10_000,
    }),
    (client) => client.findEmail("a@b.co")
  );
});

test("cancelled and mismatched picks are not accepted and do not revoke grants", () => {
  [null, undefined, { cancelled: true }, { spreadsheetId: "", pdfFileId: "" }, { spreadsheetId: null, pdfFileId: SELECTED_PDF_FILE_ID }].forEach((picks) => {
    const verdict = evaluateOwnerPicks(picks, EXPECTED);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "pick_cancelled");
    assert.equal(verdict.revokesProviderGrant, false);
  });
  const sheetMismatch = evaluateOwnerPicks({
    spreadsheetId: "other-sheet",
    pdfFileId: SELECTED_PDF_FILE_ID,
  }, EXPECTED);
  assert.equal(sheetMismatch.ok, false);
  assert.equal(sheetMismatch.reason, "picked_files_do_not_match");
  assert.equal(decidePickerSave(sheetMismatch).save, false);
  assert.equal(decidePickerSave(sheetMismatch).revokesProviderGrant, false);
  const pdfMismatch = evaluateOwnerPicks({
    spreadsheetId: SELECTED_SPREADSHEET_ID,
    pdfFileId: "other-pdf",
  }, EXPECTED);
  assert.equal(pdfMismatch.ok, false);
  assert.equal(pdfMismatch.reason, "picked_files_do_not_match");
  assert.equal(decidePickerSave(pdfMismatch).save, false);
  assert.equal(decidePickerSave(pdfMismatch).revokesProviderGrant, false);
  [
    { spreadsheetId: SELECTED_SPREADSHEET_ID, pdfFileId: null },
    { spreadsheetId: SELECTED_SPREADSHEET_ID, pdfFileId: "" },
    { spreadsheetId: SELECTED_SPREADSHEET_ID },
  ].forEach((picks) => {
    const verdict = evaluateOwnerPicks(picks, EXPECTED);
    const decision = decidePickerSave(verdict);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "pick_cancelled");
    assert.equal(decision.save, false);
    assert.equal(decision.revokesProviderGrant, false);
  });
  const match = evaluateOwnerPicks(EXPECTED, EXPECTED);
  const saved = decidePickerSave(match);
  assert.equal(match.ok, true);
  assert.equal(saved.save, true);
  assert.equal(saved.revokesProviderGrant, false);
});
