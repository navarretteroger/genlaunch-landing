#!/usr/bin/env node
"use strict";

/**
 * Local owner-consent helper. Run on a machine the PDF owner controls.
 * Reads the client id and secret from the environment, never from argv.
 * Writes the refresh token to OAUTH_REFRESH_TOKEN_OUT (mode 0600) outside this repo.
 * Does not print the token, the authorization code, or the client secret.
 * Does not change Drive or Sheet permissions.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { OWNER_ACCOUNT } = require("../src/config");
const { REDIRECT_PORT, REDIRECT_URI, createPkce, buildConsentUrl, assertTokenOutputPath } = require("../src/oauthSetup");
const { loadConfig } = require("../src/config");
const { expectedOwnerFiles, evaluateOwnerPicks, decidePickerSave, renderPickerPage } = require("../src/pickerGrant");
const { assessTokenGrant } = require("../src/selectedFiles");

const command = process.argv[2];

function missing(name) {
  console.error("Missing " + name + " in the environment. It was not read from the command line.");
  process.exit(2);
}

function warnIfWrongAccount(loginHint) {
  if (loginHint !== OWNER_ACCOUNT) {
    console.error(
      "Warning: the PDF and signup sheet are owner-only on " +
        OWNER_ACCOUNT +
        ". This project will not grant another account access."
    );
  }
}

function exchange() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId) missing("GOOGLE_OAUTH_CLIENT_ID");
  if (!clientSecret) missing("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!process.env.GOOGLE_PICKER_API_KEY) missing("GOOGLE_PICKER_API_KEY");
  if (!process.env.GOOGLE_CLOUD_PROJECT_NUMBER) missing("GOOGLE_CLOUD_PROJECT_NUMBER");
  let outputPath;
  try {
    outputPath = assertTokenOutputPath(process.env.OAUTH_REFRESH_TOKEN_OUT);
  } catch (err) {
    console.error("Set OAUTH_REFRESH_TOKEN_OUT to an absolute path outside this repository.");
    process.exit(2);
  }
  const loginHint = process.env.OWNER_LOGIN_HINT || OWNER_ACCOUNT;
  warnIfWrongAccount(loginHint);
  const pkce = createPkce();
  const expectedFiles = expectedOwnerFiles(loadConfig());
  let granted = null;
  const consentUrl = buildConsentUrl({
    clientId,
    loginHint,
    codeChallenge: pkce.challenge,
    state: pkce.state,
  });
  console.error("Listening on " + REDIRECT_URI);
  console.error("Open this URL and consent as " + OWNER_ACCOUNT + ".");
  console.error("Do not create a service account. Do not share the PDF or the sheet.");
  console.error(consentUrl);

  const server = http.createServer(async (req, res) => {
    if (req.socket.remoteAddress !== "127.0.0.1" && req.socket.remoteAddress !== "::ffff:127.0.0.1") {
      res.statusCode = 403;
      res.end("Forbidden.");
      return;
    }
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname === "/picker-session") {
      if (!granted) {
        res.statusCode = 404;
        res.end("{}");
        return;
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({
        accessToken: granted.accessToken,
        apiKey: process.env.GOOGLE_PICKER_API_KEY,
        appId: process.env.GOOGLE_CLOUD_PROJECT_NUMBER,
      }));
      return;
    }
    if (url.pathname === "/picked" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let picks = {};
      try {
        picks = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch (err) {
        picks = {};
      }
      const verdict = evaluateOwnerPicks(picks, expectedFiles);
      const decision = decidePickerSave(verdict);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      if (!decision.save || !granted) {
        res.statusCode = 409;
        res.end(JSON.stringify({
          ok: false,
          error: decision.error,
          revokesProviderGrant: false,
        }));
        console.error("Selection was not saved. Cancelling or picking a different file does not revoke access Google may already have granted. This program does not revoke account grants.");
        return;
      }
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.promises.writeFile(outputPath, granted.refreshToken + "\n", { mode: 0o600 });
      granted = null;
      res.end(JSON.stringify({ ok: true }));
      console.error("Refresh token written. It was not printed. Move it into the host secret store and delete the file.");
      server.close();
      return;
    }
    if (url.pathname !== "/") {
      res.statusCode = 404;
      res.end("Not found.");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const oauthError = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (oauthError) {
      res.end("<!doctype html><title>OAuth</title><p>Authorization was not completed. You can close this window.</p>");
      console.error("Authorization was not completed.");
      server.close();
      process.exitCode = 1;
      return;
    }
    if (!code || state !== pkce.state) {
      res.statusCode = 400;
      res.end("<!doctype html><title>OAuth</title><p>The authorization response did not match this session.</p>");
      console.error("Authorization response did not match this session.");
      server.close();
      process.exitCode = 1;
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
          code_verifier: pkce.verifier,
        }).toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      const json = await tokenRes.json();
      const grant = assessTokenGrant(json);
      if (!json || !json.refresh_token || !grant.ok) {
        res.statusCode = 502;
        res.end("<!doctype html><title>OAuth</title><p>The token was not saved. You can close this window. This page does not revoke anything in the Google account.</p>");
        console.error("Token was not saved. Google did not report exactly the file scope. This program does not revoke account grants.");
        process.exitCode = 1;
        server.close();
      } else {
        granted = { accessToken: json.access_token, refreshToken: json.refresh_token };
        res.end(renderPickerPage());
        console.error("Consent received. Pick the confirmed signup spreadsheet, then the canonical guide PDF. The refresh token is not written until those two files are picked.");
      }
    } catch (err) {
      res.statusCode = 502;
      res.end("<!doctype html><title>OAuth</title><p>Token exchange failed. You can close this window.</p>");
      console.error("Token exchange failed.");
      process.exitCode = 1;
      server.close();
    }
  });

  server.listen(REDIRECT_PORT, "127.0.0.1", () => {
    setTimeout(() => {
      console.error("Timed out waiting for the OAuth redirect.");
      server.close();
      process.exit(2);
    }, 5 * 60 * 1000).unref();
  });
}

if (command === "exchange") {
  exchange();
} else {
  console.error("Usage: node server/scripts/owner-oauth-setup.js exchange");
  console.error("Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and OAUTH_REFRESH_TOKEN_OUT in the environment, not in argv.");
  process.exit(2);
}
