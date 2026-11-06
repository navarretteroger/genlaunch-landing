"use strict";

const { OAUTH_SCOPES, OWNER_ACCOUNT } = require("./config");

const REDIRECT_URI = "http://127.0.0.1:53682/";

function buildConsentUrl(options) {
  const clientId = options.clientId;
  const redirectUri = options.redirectUri || REDIRECT_URI;
  const loginHint = options.loginHint || OWNER_ACCOUNT;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("login_hint", loginHint);
  return url.toString();
}

module.exports = {
  REDIRECT_URI,
  buildConsentUrl,
};
