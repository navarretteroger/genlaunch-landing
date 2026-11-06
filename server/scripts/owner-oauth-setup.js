#!/usr/bin/env node
"use strict";

/**
 * Local owner-consent helper. Run on a machine the PDF owner controls.
 * Reads client id/secret from the environment, never from argv.
 * Prints a refresh token to stdout only. Does not write a token file.
 * Does not change Drive or Sheet permissions.
 */
const http = require("http");
const { OWNER_ACCOUNT } = require("../src/config");
const { REDIRECT_URI, buildConsentUrl } = require("../src/oauthSetup");

const command = process.argv[2];

function missing(name) {
  console.error("Missing " + name + " in the environment. It was not read from the command line.");
  process.exit(2);
}

function warnIfWrongAccount(loginHint) {
  if (loginHint !== OWNER_ACCOUNT) {
    console.error(
      "Warning: PDF and signup sheet are owner-only on " +
        OWNER_ACCOUNT +
        ". This project will not grant another account access. Consent with a different account will fail closed."
    );
  }
}

async function printUrl() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) missing("GOOGLE_OAUTH_CLIENT_ID");
  const loginHint = process.env.OWNER_LOGIN_HINT || OWNER_ACCOUNT;
  warnIfWrongAccount(loginHint);
  const url = buildConsentUrl({ clientId, loginHint });
  console.log(url);
  console.error("Register this redirect URI on the Desktop OAuth client if required: " + REDIRECT_URI);
  console.error("Consent as " + OWNER_ACCOUNT + ". Do not create a service account. Do not share the PDF or the sheet.");
  console.error("Then run: node server/scripts/owner-oauth-setup.js exchange");
}

function exchange() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId) missing("GOOGLE_OAUTH_CLIENT_ID");
  if (!clientSecret) missing("GOOGLE_OAUTH_CLIENT_SECRET");
  const loginHint = process.env.OWNER_LOGIN_HINT || OWNER_ACCOUNT;
  warnIfWrongAccount(loginHint);
  console.error("Listening on " + REDIRECT_URI + " — open the consent URL if you have not already.");
  console.error(buildConsentUrl({ clientId, loginHint }));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== "/") {
      res.statusCode = 404;
      res.end("Not found.");
      return;
    }
    const oauthError = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (oauthError) {
      res.end("<!doctype html><title>OAuth</title><p>Authorization was not completed. You can close this window.</p>");
      console.error("Authorization was not completed: " + oauthError);
      server.close();
      process.exitCode = 1;
      return;
    }
    if (!code) {
      res.statusCode = 400;
      res.end("Missing code.");
      return;
    }
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }).toString(),
        redirect: "manual",
      });
      const json = await tokenRes.json();
      res.end(
        "<!doctype html><title>OAuth</title><p>You can close this window. If a refresh token was issued, it was printed only in the terminal that started this script. Do not paste it into GitHub, email, or the landing-page repository.</p>"
      );
      if (!json || !json.refresh_token) {
        console.error("No refresh_token was returned. Re-run with prompt=consent while the OAuth app is in Testing. Do not share the PDF or the sheet to work around this.");
        process.exitCode = 1;
      } else {
        process.stdout.write("GOOGLE_OAUTH_REFRESH_TOKEN=" + json.refresh_token + "\n");
        console.error("Store that refresh token in the host secret manager only. Do not commit it.");
      }
    } catch (err) {
      res.statusCode = 502;
      res.end("<!doctype html><title>OAuth</title><p>Token exchange failed. You can close this window.</p>");
      console.error("Token exchange failed.");
      process.exitCode = 1;
    } finally {
      server.close();
    }
  });

  server.listen(53682, "127.0.0.1", () => {
    setTimeout(() => {
      console.error("Timed out waiting for the OAuth redirect.");
      server.close();
      process.exit(2);
    }, 5 * 60 * 1000).unref();
  });
}

if (command === "url") {
  printUrl();
} else if (command === "exchange") {
  exchange();
} else {
  console.error("Usage: node server/scripts/owner-oauth-setup.js url|exchange");
  console.error("Put GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in the environment, not in argv.");
  process.exit(2);
}
