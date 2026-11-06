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
- Same email and a new key: no second row, a new token, `duplicate: true`.
- Sheet or OAuth failure: `503`, spec save-failed message, **no token**.
- Missing OAuth or signing secret: `503` with the preview sentence. Nothing is stored.

`GET /v1/guide` with `Authorization: Bearer <token>`.

- Query-string tokens are rejected so this process does not log them. Logs are method, path, and status only.
- HMAC-SHA256 over a payload of version, purpose, issued-at, expiry, and a random id. The payload has no email and no file id.
- Expired, tampered, or wrong-purpose tokens get `401` and no bytes.
- A valid token can be used more than once until it expires. Anyone who has the token can download until then. It is not proof of inbox ownership.
- Drive `401`/`403`, a redirect, or a non-PDF body: `502`, generic message, no `Location` header, no file id in the JSON.

Browser `Origin` must be allowlisted when the header is present. CORS is not authentication. A public form can be posted by any client that can reach the API. Per-IP rate limits are the abuse control (`8` signups and `20` downloads per minute by default). `TRUST_PROXY=true` only if the platform overwrites `X-Forwarded-For`.

Idempotency records live in `server/data/idempotency.json` (mode `0600`, gitignored). They store the token and a hash, not the email. The disk is local to the process. Use one instance. On ephemeral disk, a retry after restart still dedupes by email in the sheet but will mint a new token.

Formula injection: every appended cell is passed through `valueInputOption=RAW`, and values that start with `=`, `+`, `-`, `@`, tab, or CR are prefixed with an apostrophe.

## Privacy and follow-up

The notice on the page and on `privacy.html` is what the server implements:

- Stored fields are the six sheet columns. Email is the only field the visitor types.
- Purpose is guide access (the thank-you download). The PDF is not emailed.
- Spec §6.5 (one message, five business days after a verified open, not triggered by submit or download) is **documented and not running**. Open tracking does not exist. `server/src/followUpPolicy.js` throws if something calls `sendFollowUp`.
- `OUTBOUND_SENDING=on` in the environment does not turn sending on.
- No tracking pixels, no mail provider, no recipient telemetry.
- No automatic deletion job. Rows stay until the owner deletes them. That is not a certification.
- No support address is published. Set one on the page only after a verified address exists; do not invent one. `SUPPORT_CONTACT` is unused by the static page on purpose.

Spec §7.2 optional prices and any waitlist or booking URL are omitted. The soft prompt is the spec sentence plus “this form does not sign you up for a paid service.”

Spec §6.3’s production sentence that describes the follow-up as something that will be sent is not used as a promise. The production helper still points at the notice, and the notice says the policy is not running. That follows the later instruction: no consent is collected, and absent consent does not authorize outbound mail.

## Remaining inputs (parent / operator)

Do these on a machine the owner controls. Use the host’s secret store. Do not commit the results.

1. **OAuth client, same Google account.** In Google Cloud, signed in as `navarretteroger@gmail.com`, create a project if needed. A Cloud project is not a new Google account and is not a service account. Enable the Google Sheets API and the Google Drive API. Do not enable billing for this task unless that account already has it.
2. **Consent screen.** External, stay in **Testing**. Add only `navarretteroger@gmail.com` as a test user. Scopes, and no others:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.readonly`
   Do not add a Gmail send scope.
3. **Desktop OAuth client.** Create an OAuth client of type Desktop. If it asks for a redirect URI, register `http://127.0.0.1:53682/`. Do not create a service account. Do not download a service-account JSON for this app. If `GOOGLE_APPLICATION_CREDENTIALS` is set on the host, the process ignores it and logs a warning.
4. **Refresh token.** On the owner’s computer:

   ```bash
   export GOOGLE_OAUTH_CLIENT_ID="..."        # environment, not argv
   export GOOGLE_OAUTH_CLIENT_SECRET="..."    # environment, not argv
   node server/scripts/owner-oauth-setup.js url
   node server/scripts/owner-oauth-setup.js exchange
   ```

   Sign in as `navarretteroger@gmail.com` when Google asks. The script prints `GOOGLE_OAUTH_REFRESH_TOKEN=...` to that terminal only. Put it in the host secret store and clear the scrollback. Do not paste it into GitHub.

   While the consent screen stays in Testing, Google expires refresh tokens after **7 days**. Re-run the exchange when the API starts returning `capture`/`sheet` authorization errors. Do not “fix” expiry by sharing the PDF or the sheet with another user or a service account. This project does not submit the app for restricted-scope verification.

   If a different Google account is selected at consent, discard the token. The files will not be readable, and this repo will not grant that account access.

5. **Grant signing secret.** On the host:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Store it as `GRANT_SIGNING_SECRET`. It must be at least 32 characters. It never goes in the frontend.

6. **HTTPS process.** Run `npm start` behind HTTPS on any host the owner already controls. This repo does not create a hosting account and does not pick a vendor. One long-running Node 20+ process is enough. Set the environment from `.env.example` (secrets filled only on the host). Confirm:

   ```bash
   curl -sS https://<api-host>/healthz
   ```

   `captureConfigured` must be `true` before the page is switched. `false` means a name listed at startup under `missing` is still empty. `/healthz` does not print secret values or file ids.

7. **Proxy logs.** Configure the proxy not to record query strings or `Authorization` headers. The app itself logs only method, path, and status.

8. **Turn the page on, in a later reviewed change.** Only after step 6 is actually true:
   - Set `DELIVERY_MODE` to `"production"`.
   - Set `CAPTURE_API_BASE` to the API origin, no trailing secret, for example `https://api.example.com`.
   - Remove the `noindex` meta tags if the page should be indexed.
   - Keep prices, checkout, Stripe, and Skool out.

   Roger’s approval to leave preview is still required. This branch does not flip that switch.

9. **Optional.** A verified support or deletion address, if one should be published. Leave it unpublished until then.

No further sheet id is required unless the sheet is replaced. No Drive folder should be created. Do not upload this tree into Drive as part of this change; the pull request is the review copy. Do not modify Acquisition research, the Deliverables folder `1n6ExJP_masWpcUws9g0HTTe2PiZ_f38N`, or the Landing Page Handoff folder.

## Local test

```bash
npm test
```

The suite covers valid and invalid email, sheet failure without a token, duplicate email, idempotency replay and conflict, in-flight double submit, form errors and accessible names, CORS, formula neutralization with `RAW`, expired and tampered grants, Drive 401/403 and refused redirects, unconfigured capture, the private file id absent from the static frontend, no PDF in the repo, and a local mock path from signup through streamed bytes.

Those tests do not call Google. A green run is not evidence that the live sheet accepted a row or that the private PDF was downloaded.
