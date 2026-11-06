# Deployment and configuration runbook

This runbook is the operator checklist for the Customer Recovery landing API. It does not contain secrets. Do not paste client secrets, refresh tokens, or the grant signing secret into GitHub, pull requests, issues, or this file.

## Status of this repository

| Item | State |
| --- | --- |
| Page copy and layout | In the repo, spec §5–§8, preview mode by default |
| API code | In the repo. Portable Node 20+ process, no npm dependencies |
| GitHub Pages | Existing site. Source `main` `/`. No custom domain. This work does not reinitialize Pages |
| Frontend calling the API | **Off.** `js/config.js` is `DELIVERY_MODE=preview` and `CAPTURE_API_BASE=null` |
| Owner OAuth | **Not configured.** No refresh token is available to this repo |
| Signup sheet write | **Not verified by running code.** Sheet id, tab, and headers are configured from Roger’s confirmation |
| Private PDF download | **Not verified by running code.** The server default file id is the canonical guide. Tests stream a mock buffer |
| PDF and sheet ACLs | Unchanged by this work. Roger verified both files are owner-only, `shared: false`, on `navarretteroger@gmail.com` |
| Outbound email, Stripe, Skool | Off / not built |

Merging the branch updates the static page only after a person merges to `main`. It does not start the API and does not turn capture on.

## Architecture

```
Browser at https://navarretteroger.github.io/genlaunch-landing/
  -> relative pages (index, thank-you, privacy)
  -> when production is later enabled:
       POST https://<api-host>/v1/signups
       GET  https://<api-host>/v1/guide   Authorization: Bearer <token>
              |
              v
       Node server (one process)
         1. Validate email and idempotency key
         2. Owner OAuth refresh token -> short-lived access token
         3. Sheets values.append  valueInputOption=RAW
         4. HMAC bearer token (15 minutes by default)
         5. Drive files.get?alt=media  stream bytes to the browser
```

The API host is separate from GitHub Pages. Pages cannot hold the OAuth refresh token or enforce the download.

The Google principal is the **existing** account `navarretteroger@gmail.com`, the same account Roger verified as owner of both files. One refresh token carries both scopes. The server never creates a Google account, never creates a service account, and never calls the Drive permissions API.

There is no single-file OAuth scope for an existing file this app did not create. `drive.readonly` can read Drive files that account can already read. The process only requests the configured file id. Treat the refresh token as a high-value secret.

`drive.file` cannot see this PDF without a share or an interactive picker. Sharing the PDF is out of scope and is not a fallback.

## Confirmed non-secret targets

Signup sheet (owner-only, headers only, no sample rows):

- Title: Customer Recovery — Landing Page Signups
- Spreadsheet id: `1RXBQl4KQU-FUOLBmL6iXjy3mcaIzw8Xl5n5vVtcbRVw`
- URL (still requires the owner session; `shared: false`): https://docs.google.com/spreadsheets/d/1RXBQl4KQU-FUOLBmL6iXjy3mcaIzw8Xl5n5vVtcbRVw/edit
- Tab title: `Customer Recovery — Landing Page Signups` (em dash, U+2014)
- Tab sheet id: `389366344`
- Row 1: `signup_id`, `email`, `created_at_utc`, `source`, `privacy_notice_version`, `marketing_opt_in`

The server checks the tab title, the numeric sheet id, and the header row before any append. A mismatch returns an error and **does not** issue a download token.

`marketing_opt_in` is always the text `false`. The form has no opt-in box. A client that sends `true` is rejected. `false` is not consent. The sheet is only for people who submit this page. It is not the cold-prospect list and not a suppression register.

Canonical PDF (server config only, not printed in the HTML/JS):

- File id default: `1508Lh4WrwEcHKeFOx0RFm_cOSwbiHEgh`
- About 10 pages. The 17-page Simple Edition is not wired.
- The browser never receives a `drive.google.com` URL. The response is `Content-Disposition: attachment` with the PDF bytes, or an error. Redirects from Drive are refused.

Pages origin allowlist default: `https://navarretteroger.github.io`

Frontend links are relative (`css/styles.css`, `thank-you.html`) so they work under `/genlaunch-landing/`.

## Request behavior

`POST /v1/signups` JSON body: `email`, `privacyNoticeVersion` (`2026-11-06`). Header: `Idempotency-Key` (16–80 chars, `[A-Za-z0-9_-]`).

- Bad email: `400`, spec §6.4 message, no sheet write, no token.
- Same key and same email while the token has more than five seconds of life: the same JSON, including the same token, and no second row.
- Same key and a different email: `409`, no second row.
- Same email and a new key: no second row, a new token. The HTTP status and the public JSON keys match a first-time signup. The body does not include `duplicate` or `signupId`.
- A non-empty `company_website` field is a honeypot. It is rejected and not written. This is not a CAPTCHA service.
- Sheet or OAuth failure: `503`, spec save-failed message, **no token**. An append that may have landed is reconciled by `signup_id` before any second write. A `401` retries the append only after that lookup misses.
- Missing OAuth, signing secret, deletion contact, or durable idempotency storage: `503` with the preview sentence. Nothing is stored.

`GET /v1/guide` with `Authorization: Bearer <token>`.

- Query-string tokens are rejected so this process does not log them. Logs are method, path, and status only.
- HMAC-SHA256 over a payload of version, purpose, issued-at, expiry, and a random id. The payload has no email and no file id.
- Expired, tampered, or wrong-purpose tokens get `401` and no bytes.
- A valid token can be used more than once until it expires. Anyone who has the token can download until then. It is not proof of inbox ownership.
- Drive `401`/`403`, a redirect, or a non-PDF body: `502`, generic message, no `Location` header, no file id in the JSON.

Browser `Origin`, when present, must be allowlisted. A missing `Origin` is not treated as the Pages site. CORS does not authenticate the caller, does not stop a script from posting, and does not stop someone who has a bearer token from using it. Per-IP limits default to 8 signups and 20 downloads per minute. A separate global cap defaults to 30 signups and 60 downloads per hour so one forged address cannot spend the whole Sheets quota.

`TRUST_PROXY=true` without `TRUSTED_PROXY_CIDRS` refuses to start. When the immediate socket address is not in that list, `X-Forwarded-For` is ignored. When the peer is trusted, the client address is the first entry from the right that is not itself in the trusted list. A chain of only trusted hops uses the socket address. The leftmost header value is not used.

Idempotency records live in `server/data/idempotency.json` (mode `0600`, gitignored, capped, 48-hour TTL). They store the token and a hash, not the email. If that directory cannot be created, the process exits. It does not fall back to memory. `IDEMPOTENCY_STORE=memory` starts, but signups stay unavailable because the store is not durable. Use one instance. A restart can mint a new token for the same idempotency key; the sheet still dedupes the email.

Formula injection: every appended cell is passed through `valueInputOption=RAW`, and values that start with `=`, `+`, `-`, `@`, tab, or CR are prefixed with an apostrophe.

## Privacy

The preview text is what visitors see while `DELIVERY_MODE` is `preview`. The production paragraphs stay hidden until `CAPTURE_API_BASE` and `SUPPORT_CONTACT` are both set. There is no marketing checkbox. `marketing_opt_in` is the text `false`. That is not consent to messages. This process does not send email. That project rule is the whole outbound policy here; it is not a claim about email law in every jurisdiction.

Spec §6.5 is not shown on the page. `server/src/followUpPolicy.js` throws if something calls `sendFollowUp`.

No automatic deletion job exists. The owner can delete a row by hand. That is not a retention guarantee. Google stores the sheet, GitHub Pages stores the static site, and the API host can keep its own connection logs. This process logs method, path, and status.

A verified deletion contact is a launch blocker. Leave `SUPPORT_CONTACT` empty and `js/config.js` `SUPPORT_CONTACT` null until a real address is chosen. The page does not invent one. When both are set later, they should be the same address, and the production notice prints it.

Spec §7.2 optional prices and any waitlist or booking URL are omitted.

## Remaining inputs (parent / operator)

Do these on a machine the owner controls. Use the host’s secret store. Do not commit the results.

1. **OAuth client, same Google account.** In Google Cloud, signed in as `navarretteroger@gmail.com`, create a project if needed. A Cloud project is not a new Google account and is not a service account. Enable the Google Sheets API and the Google Drive API. Do not enable billing for this task unless that account already has it.
2. **Scopes, and the accepted risk.** There is no OAuth scope for one existing spreadsheet or one existing Drive file that this app did not create. The scopes this server requests are:
   - `https://www.googleapis.com/auth/spreadsheets` — sensitive. It can edit every spreadsheet the owner can edit. Required to append a row. `spreadsheets.readonly` cannot append.
   - `https://www.googleapis.com/auth/drive.readonly` — restricted. It can view and download every Drive file the owner can already open ([Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)).
   `drive.file` is narrower, but it only covers files the app created or the user picked, which would grant the app a file-level permission. This project does not use it, because the PDF and the sheet stay owner-only with no permission change. The process only calls the configured spreadsheet id and file id. That limit is in this code, not in the Google token. Do not add a Gmail scope. Do not create a service account.
3. **Publishing status.** Checked against Google’s public docs on 6 Nov 2026:
   - A consent screen whose publishing status is **Testing**, for an external user type, gets refresh tokens that expire in 7 days, unless the only scopes are profile scopes ([refresh token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)). These Sheets and Drive scopes are not profile scopes. Testing mode is not a durable production setup.
   - Setting publishing status to **In production** is what Google’s expiration page ties to removing that 7-day Testing limit. It does not by itself verify the app.
   - `drive.readonly` is restricted and `spreadsheets` is sensitive. Until those scopes are verified, Google shows the unverified-app screen. Unverified apps that show that screen are capped at 100 new users over the life of the project ([Unverified apps](https://support.google.com/cloud/answer/7454865)). That cap is not a way to skip verification, and this runbook does not claim it is. Google’s restricted-scope page also says a personal-use app can still hit the unverified warning, the user cap, and a limited refresh-token lifetime while it remains a test configuration ([restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).
   - Refresh tokens also stop working if revoked, unused for six months, or if the account passes 100 live refresh tokens for that client id ([same expiration section](https://developers.google.com/identity/protocols/oauth2#expiration)).
   - This repository does not change the consent screen and does not submit verification. If a long-lived token requires verification or Google’s restricted-scope security assessment because the server transmits Drive file bytes, that submission is a separate decision. Do not share the PDF or the sheet instead.
4. **Desktop OAuth client and consent.** Create an OAuth client of type Desktop under the same account. Register redirect URI `http://127.0.0.1:53682/`. The helper uses PKCE S256, a `state` value checked on the loopback response, and listens only on `127.0.0.1`. It writes the refresh token to `OAUTH_REFRESH_TOKEN_OUT` with mode `0600` and does not print the token or the authorization code. The path must be absolute and outside this repo.

   ```bash
   export GOOGLE_OAUTH_CLIENT_ID="..."
   export GOOGLE_OAUTH_CLIENT_SECRET="..."
   export OAUTH_REFRESH_TOKEN_OUT="/absolute/path/outside/the/repo/refresh-token"
   node server/scripts/owner-oauth-setup.js exchange
   ```

   Consent as `navarretteroger@gmail.com`. Move the file into the host secret store and delete it. If a different account is selected, delete the file. This repo will not grant that account access. If `GOOGLE_APPLICATION_CREDENTIALS` is set, the process ignores it.

5. **Grant signing secret.** On the host:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Store it as `GRANT_SIGNING_SECRET`. It must be at least 32 characters. It never goes in the frontend.

6. **HTTPS process.** Run `npm start` behind HTTPS on any host the owner already controls. This repo does not create a hosting account and does not pick a vendor. One long-running Node 20+ process is enough. Set the environment from `.env.example` (secrets filled only on the host). Confirm:

   ```bash
   curl -sS https://<api-host>/healthz
   ```

   `/healthz` reports `configPresent`, `deletionContactConfigured`, `durableIdempotency`, and `captureConfigured` separately from `googleAuth` and `sheets`, which stay `unknown` on this endpoint. It does not download the PDF and does not print secrets or rows. Before calling the page ready, run:

   ```bash
   node server/scripts/probe.js
   ```

   That refreshes the owner token and reads the sheet tab and header row. It prints `googleAuth` and `sheets` as `ok` or `fail`, and `pdfDownload: "not_run"`. It does not print tokens or email addresses.

7. **Proxy logs.** Configure the proxy not to record query strings or `Authorization` headers. The app itself logs only method, path, and status. Set `TRUSTED_PROXY_CIDRS` to the immediate proxy addresses before `TRUST_PROXY=true`.

8. **Turn the page on, in a later reviewed change.** Only after health shows config, contact, and durable storage, and `probe.js` shows `googleAuth` and `sheets` ok:
   - Set `DELIVERY_MODE` to `"production"`.
   - Set `CAPTURE_API_BASE` to the API origin, for example `https://api.example.com`.
   - Set `SUPPORT_CONTACT` in `js/config.js` to the same verified address as the server.
   - Remove the `noindex` meta tags if the page should be indexed.
   - Keep prices, checkout, Stripe, and Skool out.

   This branch does not flip that switch.

9. **Verified deletion contact.** Required before capture. Do not publish a placeholder.

No further sheet id is required unless the sheet is replaced. No Drive folder should be created. Do not upload this tree into Drive as part of this change; the pull request is the review copy. Do not modify Acquisition research, the Deliverables folder `1n6ExJP_masWpcUws9g0HTTe2PiZ_f38N`, or the Landing Page Handoff folder.

## Local test

```bash
npm test
```

The suite covers valid and invalid email, sheet failure without a token, duplicate email, idempotency replay and conflict, in-flight double submit, form errors and accessible names, CORS, formula neutralization with `RAW`, expired and tampered grants, Drive 401/403 and refused redirects, unconfigured capture, the private file id absent from the static frontend, no PDF in the repo, and a local mock path from signup through streamed bytes.

Those tests do not call Google. A green run is not evidence that the live sheet accepted a row or that the private PDF was downloaded.
