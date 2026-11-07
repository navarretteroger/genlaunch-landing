# GenLaunch landing — Customer Recovery guide

Unpublished static pages for GitHub Pages. The signup control is a SendFox embed slot. It is **not connected**. This site does not send email, and it does not publish the guide file.

Live site: https://navarretteroger.github.io/genlaunch-landing/ still serves `main` until a person merges. This branch is not merged.

Earlier Google OAuth work remains in git history. That history did not revoke any Google account grant.

The pages still use the earlier quiet layout: warm white `#F7F6F3`, forest green `#1F4B3A`, Inter or the system font, and a narrow column. Roger’s later cinematic handoff (video hero, modals, bold headings, purple call to action) is a separate design follow-up. It is not implemented here.

## What is blocked

Roger approves activation. These inputs are missing, and the page stays honest until they exist:

1. A SendFox form and list created for **this** Customer Recovery guide. Do not reuse the Lease Newsletter form or the older Generator Readiness for Healthcare Clinics page.
2. The vendor embed snippet from that form’s Get embed code screen, or its legacy form id and public id. No API key is required for the public embed, and none belongs in this repo.
3. A verified sending domain and the confirmation step SendFox will actually use.
4. An approved public guide URL or other delivery method SendFox is allowed to email. The guide file is still owner-only. This repo does not link it.
5. A reviewed privacy notice and footer. No mailing address is copied here.
6. Roger’s explicit decision to turn the form on. `js/config.js` has `OFFER_REVIEWED: false`.

## Local check

```bash
npm test
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/`. Submitting an email must say nothing was sent.

Official embed notes: [create a form](https://help.sendfox.com/article/306-how-to-create-an-embeddable-html-form) and [legacy HTML](https://help.sendfox.com/article/302-how-can-i-format-my-sendfox-html-form). The legacy form posts to `https://sendfox.com/form/{formId}/{publicId}` and loads `https://sendfox.com/js/form.js`. This copy does not load that script.
