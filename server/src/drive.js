"use strict";

const { Readable } = require("stream");
const { CodedError } = require("./errors");
const { OwnerOAuth } = require("./oauth");
const { fetchUntilHeaders, streamWithIdleTimeout } = require("./googleFetch");
const { assertSelectedPdf } = require("./selectedFiles");

function createDriveClient(options) {
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

  function fileUrl() {
    const fileId = assertSelectedPdf(config.driveFileId);
    return (
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?alt=media&supportsAllDrives=false"
    );
  }

  async function requestOnce(token, signal) {
    return fetchUntilHeaders(fetchImpl, fileUrl(), {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      signal,
    }, {
      headerTimeoutMs: config.googleTimeoutMs || 8000,
      timers: config.timers,
      signal,
    });
  }

  async function openConfiguredPdf(options) {
    assertSelectedPdf(config.driveFileId);
    const signal = options && options.signal;
    if (!config.driveFileId || !config.googleRefreshToken) {
      throw new CodedError("not_configured");
    }
    let token = await auth.getAccessToken();
    let res;
    try {
      res = await requestOnce(token, signal);
    } catch (err) {
      throw new CodedError("drive_unavailable");
    }
    if (res.status === 401) {
      if (res.body && res.body.cancel) await res.body.cancel().catch(() => undefined);
      auth.invalidate();
      try {
        token = await auth.getAccessToken();
        res = await requestOnce(token, signal);
      } catch (err) {
        throw new CodedError("drive_unauthorized");
      }
    }
    if (res.status >= 300 && res.status < 400) {
      if (res.body && res.body.cancel) await res.body.cancel().catch(() => undefined);
      throw new CodedError("drive_redirect_refused");
    }
    if (res.status === 401 || res.status === 403) {
      if (res.body && res.body.cancel) await res.body.cancel().catch(() => undefined);
      throw new CodedError("drive_unauthorized");
    }
    if (res.status === 404) {
      if (res.body && res.body.cancel) await res.body.cancel().catch(() => undefined);
      throw new CodedError("drive_not_found");
    }
    if (res.status < 200 || res.status >= 300) {
      if (res.body && res.body.cancel) await res.body.cancel().catch(() => undefined);
      throw new CodedError("drive_unavailable");
    }
    const contentType = String(res.headers.get("content-type") || "");
    if (!/application\/pdf|application\/octet-stream/i.test(contentType)) {
      if (res.body && res.body.cancel) await res.body.cancel().catch(() => undefined);
      throw new CodedError("drive_unexpected_type");
    }
    const lengthHeader = res.headers.get("content-length");
    const contentLength = lengthHeader && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;
    const body = streamWithIdleTimeout(res.body, {
      idleMs: config.driveBodyIdleMs || 20000,
      timers: config.timers,
      signal,
    });
    return {
      stream: Readable.fromWeb(body),
      contentType: "application/pdf",
      contentLength,
    };
  }

  return { openConfiguredPdf, fileUrl };
}

module.exports = { createDriveClient };
