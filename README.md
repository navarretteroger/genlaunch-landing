# GenLaunch landing — Customer Recovery guide

Static GitHub Pages site plus a small Node API. The page offers the free Customer Recovery guide to service-only independent generator shops. The API, once configured, validates an email, appends a row to a private Google Sheet, and streams the private canonical PDF through a short-lived bearer token.

The Pages site in this repo stays in **preview** until `js/config.js` is changed in a reviewed update. Preview does not store the email and does not download a PDF.

Live site today: https://navarretteroger.github.io/genlaunch-landing/ (GitHub Pages, `main`, repository root). This branch does not change that site until a person merges it. Merging while `DELIVERY_MODE` is `preview` still does not capture email.

## What is not claimed

- Google OAuth is **not** configured here. No refresh token, client secret, or signing secret is in the repo.
- Tests use in-process mocks. They do **not** write the signup sheet and do **not** download the private PDF.
- The PDF and the sheet stay owner-only (`shared: false`) on the existing account `navarretteroger@gmail.com`. This code does not grant permissions and does not use a service account.
- Outbound email is off. Stripe and Skool are not part of this page.

Setup that is still required is listed in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). A filled acceptance check is in [QA-checklist-filled.md](QA-checklist-filled.md).

## Run the page locally

```bash
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

Submit a valid email. The status line must say nothing was stored and no PDF was fulfilled. Opening `thank-you.html` directly shows the preview thank-you, not a download.

## Run the API locally

```bash
npm test
npm start
```

`npm start` listens on port 8080. Until the host has the owner refresh token, `GRANT_SIGNING_SECRET`, a verified deletion contact, and a writable idempotency directory, `POST /v1/signups` returns the preview message and does not issue a download token. `/healthz` does not treat saved config as proof that Google accepted the token. Run `node server/scripts/probe.js` for that check. It does not download the PDF.

## Layout

| Path | Role |
| --- | --- |
| `index.html`, `thank-you.html`, `privacy.html` | Pages files. Relative URLs work under `/genlaunch-landing/`. |
| `js/config.js` | Public switch. Preview and `CAPTURE_API_BASE: null` by default. |
| `server/` | Portable Node API. Zero npm dependencies. |
| `server/scripts/owner-oauth-setup.js` | Local consent helper for the existing owner account. |
| `docs/DEPLOYMENT.md` | Runbook and remaining inputs. |
