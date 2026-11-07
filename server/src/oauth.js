"use strict";

const { CodedError } = require("./errors");
const { googleFetch } = require("./googleFetch");
const { assessTokenGrant } = require("./selectedFiles");

class OwnerOAuth {
  constructor(options) {
    this.clientId = options.clientId || "";
    this.clientSecret = options.clientSecret || "";
    this.refreshToken = options.refreshToken || "";
    this.fetchImpl = options.fetchImpl;
    this.now = options.now || Date.now;
    this.timeoutMs = options.timeoutMs || 8000;
    this.cached = null;
  }

  invalidate() {
    this.cached = null;
  }

  async getAccessToken() {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new CodedError("oauth_not_configured");
    }
    const now = this.now();
    if (this.cached && now < this.cached.expiresAtMs - 60000) {
      return this.cached.token;
    }
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: "refresh_token",
    });
    if (body.has("scope")) throw new CodedError("oauth_scope_widening_refused");
    let res;
    try {
      res = await googleFetch(this.fetchImpl, "https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }, this.timeoutMs);
    } catch (err) {
      throw new CodedError("oauth_refresh_failed");
    }
    if (!res || res.status < 200 || res.status >= 300) {
      throw new CodedError("oauth_refresh_failed");
    }
    const json = await res.json();
    if (!json || !json.access_token) {
      throw new CodedError("oauth_refresh_failed");
    }
    const grant = assessTokenGrant(json);
    if (!grant.ok) {
      throw new CodedError(grant.code);
    }
    const ttlSeconds = Number(json.expires_in) > 0 ? Number(json.expires_in) : 3600;
    this.cached = {
      token: json.access_token,
      expiresAtMs: now + ttlSeconds * 1000,
    };
    return json.access_token;
  }
}

module.exports = { OwnerOAuth };
