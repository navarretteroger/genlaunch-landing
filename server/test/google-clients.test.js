"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("stream");
const { loadConfig, SHEET_TAB_DEFAULT, REQUIRED_HEADERS, DRIVE_FILE_ID_DEFAULT } = require("../src/config");
const { createSheetsClient } = require("../src/sheets");
const { createDriveClient } = require("../src/drive");
const { OwnerOAuth } = require("../src/oauth");
const { configuredEnv, jsonResponse, pdfResponse } = require("../src/testHelpers");

function headerRow() {
  return REQUIRED_HEADERS.slice();
}

test("OAuth refresh uses the owner refresh token and caches the access token", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init.body });
    return jsonResponse(200, { access_token: "access-fixture", expires_in: 3600, token_type: "Bearer" });
  };
  const auth = new OwnerOAuth({
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    refreshToken: "test-refresh-token",
    fetchImpl,
    now: () => 1_000_000,
  });
  assert.equal(await auth.getAccessToken(), "access-fixture");
  assert.equal(await auth.getAccessToken(), "access-fixture");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  assert.match(calls[0].body, /grant_type=refresh_token/);
  assert.match(calls[0].body, /refresh_token=test-refresh-token/);
  assert.equal(calls[0].body.includes("urn:ietf:params:oauth:grant-type:jwt-bearer"), false);
  auth.invalidate();
  await auth.getAccessToken();
  assert.equal(calls.length, 2);
});

test("Sheets append uses RAW, exact tab, and neutralizes formula email", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, authorization: init.headers.Authorization });
    if (url.includes("oauth2.googleapis.com")) {
      return jsonResponse(200, { access_token: "access-fixture", expires_in: 3600 });
    }
    if (url.includes("fields=sheets.properties")) {
      return jsonResponse(200, {
        sheets: [{ properties: { sheetId: 389366344, title: SHEET_TAB_DEFAULT } }],
      });
    }
    if (url.includes(":append")) {
      return jsonResponse(200, { updates: { updatedRows: 1 } });
    }
    if (decodeURIComponent(url).includes("A1:F1")) {
      return jsonResponse(200, { values: [headerRow()] });
    }
    return jsonResponse(200, { values: [headerRow()] });
  };
  const config = loadConfig(configuredEnv());
  const sheets = createSheetsClient({ config, fetchImpl, now: () => 5_000 });
  const appended = await sheets.append({
    signup_id: "11111111-1111-4111-8111-111111111111",
    email: "=a@b.co",
    created_at_utc: "2026-11-06T21:00:00.000Z",
    source: "+genlaunch-landing",
    privacy_notice_version: "2026-11-06",
    marketing_opt_in: "false",
    phone: "555",
  });
  const appendCall = calls.find((call) => call.url.includes(":append"));
  assert.ok(appendCall);
  assert.match(appendCall.url, /valueInputOption=RAW/);
  assert.equal(appendCall.url.includes("USER_ENTERED"), false);
  assert.ok(decodeURIComponent(appendCall.url).includes(SHEET_TAB_DEFAULT));
  assert.ok(appendCall.url.includes(config.sheetId));
  const values = JSON.parse(appendCall.body).values[0];
  assert.deepEqual(values, [
    "11111111-1111-4111-8111-111111111111",
    "'=a@b.co",
    "2026-11-06T21:00:00.000Z",
    "'+genlaunch-landing",
    "2026-11-06",
    "false",
  ]);
  assert.equal(JSON.stringify(values).includes("555"), false);
  assert.equal(appended.values[1], "'=a@b.co");
  assert.equal(appendCall.authorization, "Bearer access-fixture");
});

test("Sheets header or tab mismatch does not append", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (url.includes("oauth2.googleapis.com")) return jsonResponse(200, { access_token: "access-fixture", expires_in: 3600 });
    if (url.includes("fields=sheets.properties")) {
      return jsonResponse(200, {
        sheets: [{ properties: { sheetId: 1, title: SHEET_TAB_DEFAULT } }],
      });
    }
    return jsonResponse(200, { values: [["email"]] });
  };
  const sheets = createSheetsClient({ config: loadConfig(configuredEnv()), fetchImpl, now: () => 9_000 });
  await assert.rejects(() => sheets.append({ email: "a@b.co" }), /sheet_tab_mismatch/);
  assert.equal(calls.some((url) => url.includes(":append")), false);
});

test("Sheets unauthorized response does not return a public link", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("oauth2.googleapis.com")) return jsonResponse(200, { access_token: "access-fixture", expires_in: 3600 });
    return {
      status: 403,
      headers: new Headers({ location: "https://drive.google.com/file/d/private/view" }),
      json: async () => ({ error: { message: "forbidden" } }),
      body: null,
    };
  };
  const sheets = createSheetsClient({ config: loadConfig(configuredEnv()), fetchImpl, now: () => 9_000 });
  await assert.rejects(
    () => sheets.findEmail("a@b.co"),
    (err) => {
      assert.equal(err.code, "sheet_unauthorized");
      assert.equal(String(err.message).includes("drive.google.com"), false);
      return true;
    }
  );
});

test("Drive streams the configured file and refuses redirects", async () => {
  const payload = Buffer.from("%PDF-1.4\nmock");
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, redirect: init.redirect, authorization: init.headers && init.headers.Authorization });
    if (url.includes("oauth2.googleapis.com")) return jsonResponse(200, { access_token: "access-fixture", expires_in: 3600 });
    assert.ok(url.includes("/drive/v3/files/" + encodeURIComponent(DRIVE_FILE_ID_DEFAULT)));
    assert.match(url, /alt=media/);
    assert.match(url, /supportsAllDrives=false/);
    assert.equal(url.includes("/permissions"), false);
    return pdfResponse(200, { "content-type": "application/pdf", "content-length": String(payload.length) }, payload);
  };
  const drive = createDriveClient({ config: loadConfig(configuredEnv()), fetchImpl, now: () => 10_000 });
  const opened = await drive.openConfiguredPdf();
  const chunks = [];
  for await (const chunk of opened.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).equals(payload), true);
  assert.equal(opened.contentType, "application/pdf");
  assert.equal(calls.some((call) => call.redirect === "manual"), true);
});

test("Drive 302 is not followed and 403 is unauthorized", async () => {
  async function driveWith(status, location) {
    const fetchImpl = async (url) => {
      if (url.includes("oauth2.googleapis.com")) return jsonResponse(200, { access_token: "access-fixture", expires_in: 3600 });
      return {
        status,
        headers: new Headers(location ? { location, "content-type": "text/html" } : { "content-type": "text/html" }),
        body: Readable.toWeb(Readable.from([Buffer.from("<html>no</html>")])),
        json: async () => ({}),
      };
    };
    return createDriveClient({ config: loadConfig(configuredEnv()), fetchImpl, now: () => 11_000 });
  }
  await assert.rejects(() => driveWith(302, "https://drive.google.com/file/d/1508/view").then((client) => client.openConfiguredPdf()), (err) => {
    assert.equal(err.code, "drive_redirect_refused");
    assert.equal(String(err.message).includes("drive.google.com"), false);
    return true;
  });
  await assert.rejects(() => driveWith(403).then((client) => client.openConfiguredPdf()), (err) => {
    assert.equal(err.code, "drive_unauthorized");
    return true;
  });
});

test("Drive retries once after an access token 401", async () => {
  let driveCalls = 0;
  let tokenCalls = 0;
  const payload = Buffer.from("%PDF-1.4\nretry");
  const fetchImpl = async (url) => {
    if (url.includes("oauth2.googleapis.com")) {
      tokenCalls += 1;
      return jsonResponse(200, { access_token: "access-" + tokenCalls, expires_in: 3600 });
    }
    driveCalls += 1;
    if (driveCalls === 1) {
      return { status: 401, headers: new Headers(), body: null, json: async () => ({}) };
    }
    return pdfResponse(200, { "content-type": "application/pdf" }, payload);
  };
  const drive = createDriveClient({ config: loadConfig(configuredEnv()), fetchImpl, now: () => 12_000 });
  const opened = await drive.openConfiguredPdf();
  const chunks = [];
  for await (const chunk of opened.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), payload.toString());
  assert.equal(driveCalls, 2);
  assert.equal(tokenCalls, 2);
});
