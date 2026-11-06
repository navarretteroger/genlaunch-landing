# QA checklist (spec §12) — this branch

**Checked:** Friday, November 6, 2026  
**Mode in the shipped page:** preview (`js/config.js`)  
**API:** implemented, not configured with owner OAuth

Legend: `[x]` covered in this branch · `[~]` partial · `[ ]` not done · `[n/a]` out of scope

## 12.1 Content

- [x] H1 matches the spec headline
- [x] Primary CTA exact on hero, submit, and sticky bar
- [x] Three benefits: Identify records to review / Use the scripts / Track follow-up
- [x] About uses only Roger Navarrette
- [x] No revenue guarantees, fake testimonials, audit offer, countdown, or `$100M`
- [x] No checkout. Soft DWY/DFY sentence is present on the production thank-you, which stays hidden in preview. Spec optional prices are omitted (later instruction: no paid price and no waitlist URL)
- [x] Intake form is not linked
- [x] Preview copy says ~10 pages. The 17-page Simple Edition id is not in the repo

## 12.2 Form behavior

- [x] Email-only field. No phone, revenue, ownership, or AI-dialing field
- [x] §6.4 messages in client helpers and server validation, locked by tests
- [x] Preview: no persistence, no download, preview sentence on submit
- [~] Production path validate → persist → redirect is implemented and covered with a mock sheet. It does not run in the shipped page, and it has not been executed against the live sheet
- [~] Privacy notice matches preview until production config and a verified deletion contact exist. It does not collect a marketing opt-in. Outbound sending stays off. No contact address is invented
- [x] In-flight double submit, retry idempotency key, and server duplicate email are tested
- [x] Production mode on the page requires `DELIVERY_MODE=production` and `CAPTURE_API_BASE`. Both are unset

## 12.3 Thank-you / download

- [~] Immediate download control exists for a real grant and is hidden in preview
- [x] Download is `GET /v1/guide` with a bearer token. Tests reject Drive redirects. Frontend has no Drive URL and no file id
- [x] Button is a named `<button>`, min height 44px, keyboard focusable when shown
- [x] Soft prompt has no charge, no auto-enroll, no booking link
- [x] Success copy does not say the guide was emailed

## 12.4 Follow-up policy

- [x] Documented in `docs/DEPLOYMENT.md` and `server/src/followUpPolicy.js`
- [x] Not triggered by submit, download, or page view. No open tracking. Status stays pending
- [x] `sendFollowUp()` throws. No mail library
- [n/a] No timing test that sends mail. No synthetic sender was added
- [x] This branch does not change campaign send permissions

## 12.5 Design / a11y / responsive

- [x] Spec tokens, single column under 768px, 44px targets, focus rings, reduced motion
- [x] One `h1` on the landing page. Labels, `aria-invalid` / `aria-describedby`, alert and status regions
- [x] Preview banner is in the HTML while mode is preview

## 12.6 Security / privacy / architecture honesty

- [x] No secrets in frontend. `.env.example` secrets are empty
- [x] No customer-record fields. No tracking pixels
- [x] No Drive permission calls. No service account. No PDF binary
- [x] Tests do not claim a live secure gate. `/healthz` reports `captureConfigured: false` without secrets
- [x] Static PDF is not the delivery door
- [~] Controlled download endpoint exists in code. It is not deployed and has not read the private file

## 12.7 Handoff

- [x] No Drive folders created. No Docs or Acquisition files modified
- [x] No sharing performed
- [n/a] Drive handoff upload. Roger will read Drive himself. Review surface is the pull request

## Not verified against Google

- [ ] Sheet row append with the owner refresh token
- [ ] Byte download of file `1508Lh4WrwEcHKeFOx0RFm_cOSwbiHEgh`
- [ ] OAuth consent completed
- [ ] API hostname chosen or HTTPS process started
