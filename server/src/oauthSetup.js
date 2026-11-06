"use strict";

const crypto = require("crypto");
const path = require("path");
const { OAUTH_SCOPES, OWNER_ACCOUNT } = require("./config");

const REDIRECT_PORT = 53682;
const REDIRECT_URI = "http://127.0.0.1:" + REDIRECT_PORT + "/";

function createPkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(24).toString("base64url");
  return { verifier, challenge, state };
}

function buildConsentUrl(options) {
  if (!options.clientId) throw new Error("client_id_required");
  if (!options.codeChallenge || !options.state) throw new Error("pkce_required");
  const redirectUri = options.redirectUri || REDIRECT_URI;
  if (!isLoopbackRedirect(redirectUri)) throw new Error("redirect_not_loopback");
  const loginHint = options.loginHint || OWNER_ACCOUNT;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", options.state);
  url.searchParams.set("login_hint", loginHint);
  return url.toString();
}

function isLoopbackRedirect(value) {
  let url;
  try {
    url = new URL(value);
  } catch (err) {
    return false;
  }
  return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.pathname === "/";
}

function assertTokenOutputPath(filePath, repoRoot) {
  if (!filePath || !path.isAbsolute(filePath)) {
    const err = new Error("token_output_path_required");
    err.code = "token_output_path_required";
    throw err;
  }
  const resolved = path.resolve(filePath);
  const root = path.resolve(repoRoot || path.join(__dirname, "..", ".."));
  if (resolved === root || resolved.startsWith(root + path.sep)) {
    const err = new Error("token_output_inside_repo");
    err.code = "token_output_inside_repo";
    throw err;
  }
  return resolved;
}

module.exports = {
  REDIRECT_PORT,
  REDIRECT_URI,
  createPkce,
  buildConsentUrl,
  isLoopbackRedirect,
  assertTokenOutputPath,
};
