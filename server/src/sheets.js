"use strict";

const { CodedError } = require("./errors");
const { sanitizeCell } = require("./sanitize");
const { OwnerOAuth } = require("./oauth");
const { googleFetch } = require("./googleFetch");

function quoteTab(name) {
  return "'" + String(name).replace(/'/g, "''") + "'";
}

function createSheetsClient(options) {
  const config = options.config;
  const fetchImpl = options.fetchImpl;
  const now = options.now || Date.now;
  const auth =
    options.auth ||
    new OwnerOAuth({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      refreshToken: config.googleRefreshToken,
      fetchImpl,
      now,
      timeoutMs: config.googleTimeoutMs,
    });
  let readyUntil = 0;

  function valuesUrl(range, suffix) {
    return (
      "https://sheets.googleapis.com/v4/spreadsheets/" +
      encodeURIComponent(config.sheetId) +
      "/values/" +
      encodeURIComponent(range) +
      (suffix || "")
    );
  }

  async function requestOnce(url, init) {
    const token = await auth.getAccessToken();
    let res;
    try {
      res = await googleFetch(fetchImpl, url, {
        method: init && init.method ? init.method : "GET",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: init && init.body ? init.body : undefined,
        signal: init && init.signal,
      }, config.googleTimeoutMs);
    } catch (err) {
      throw new CodedError("sheet_unavailable");
    }
    return res;
  }

  async function authorized(url, init) {
    const method = init && init.method ? init.method : "GET";
    let res = await requestOnce(url, init);
    // Retry a read after one token refresh. Never retry an append here:
    // the write may have landed before the error response.
    if (res.status === 401 && method === "GET") {
      if (res.body && res.body.cancel) await res.body.cancel().catch(() => undefined);
      auth.invalidate();
      res = await requestOnce(url, init);
    }
    if (res.status >= 300 && res.status < 400) {
      if (res.body && res.body.cancel) await res.body.cancel().catch(() => undefined);
      throw new CodedError("sheet_redirect_refused");
    }
    if (res.status === 401 || res.status === 403) {
      if (res.body && res.body.cancel) await res.body.cancel().catch(() => undefined);
      throw new CodedError("sheet_unauthorized");
    }
    if (res.status < 200 || res.status >= 300) {
      if (res.body && res.body.cancel) await res.body.cancel().catch(() => undefined);
      throw new CodedError("sheet_unavailable");
    }
    return res.json();
  }

  async function readRows() {
    await assertReady();
    const data = await authorized(
      valuesUrl(quoteTab(config.sheetTab) + "!A:F") + "?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE"
    );
    const rows = data && Array.isArray(data.values) ? data.values : [];
    const header = rows[0] || [];
    const emailIdx = header.indexOf("email");
    const idIdx = header.indexOf("signup_id");
    if (emailIdx < 0 || idIdx < 0) throw new CodedError("sheet_header_mismatch");
    return { rows, emailIdx, idIdx };
  }

  async function assertReady() {
    const nowMs = now();
    if (nowMs < readyUntil) return;
    const meta = await authorized(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        encodeURIComponent(config.sheetId) +
        "?fields=sheets.properties(sheetId,title)"
    );
    const sheets = meta && Array.isArray(meta.sheets) ? meta.sheets : [];
    const match = sheets.find((sheet) => sheet.properties && sheet.properties.title === config.sheetTab);
    if (!match) throw new CodedError("sheet_tab_mismatch");
    if (String(match.properties.sheetId) !== String(config.sheetGid)) {
      throw new CodedError("sheet_tab_mismatch");
    }
    const headerRes = await authorized(valuesUrl(quoteTab(config.sheetTab) + "!A1:F1"));
    const header = headerRes && headerRes.values && headerRes.values[0] ? headerRes.values[0] : [];
    const expected = config.requiredHeaders;
    const matches =
      header.length === expected.length && expected.every((name, index) => header[index] === name);
    if (!matches) throw new CodedError("sheet_header_mismatch");
    readyUntil = nowMs + 30000;
  }

  async function findEmail(normalizedEmail) {
    const table = await readRows();
    for (let i = 1; i < table.rows.length; i += 1) {
      const raw = table.rows[i][table.emailIdx] == null ? "" : String(table.rows[i][table.emailIdx]);
      const cell = raw.trim().toLowerCase().replace(/^'/, "");
      if (cell === normalizedEmail) {
        return { signupId: String(table.rows[i][table.idIdx] || ""), email: cell };
      }
    }
    return null;
  }

  async function findSignupId(signupId) {
    const table = await readRows();
    for (let i = 1; i < table.rows.length; i += 1) {
      if (String(table.rows[i][table.idIdx] || "") === signupId) {
        return { signupId };
      }
    }
    return null;
  }

  async function append(row) {
    await assertReady();
    const values = config.requiredHeaders.map((header) => sanitizeCell(row[header] == null ? "" : row[header]));
    const range = quoteTab(config.sheetTab) + "!A:F";
    const url =
      valuesUrl(range) +
      ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS";
    await authorized(url, {
      method: "POST",
      body: JSON.stringify({ values: [values] }),
    });
    return { appended: true, values };
  }

  return {
    assertReady,
    findEmail,
    findSignupId,
    append,
    invalidateAuth() {
      auth.invalidate();
    },
    quoteTab,
  };
}

module.exports = { createSheetsClient, quoteTab };
