# GenLaunch landing — Customer Recovery guide

Unpublished static pages for GitHub Pages. The Customer Recovery signup reference is recorded in `js/config.js`. Integration and delivery are off. This site does not load the SendFox loader, does not submit the form, and does not publish the guide file.

Live site: https://navarretteroger.github.io/genlaunch-landing/ still serves `main` until a person merges. This branch is not merged.

Earlier Google OAuth work remains in git history. That history did not revoke any Google account grant.

The pages still use the earlier quiet layout: warm white `#F7F6F3`, forest green `#1F4B3A`, Inter or the system font, and a narrow column. The later cinematic handoff is a separate design follow-up and is not implemented here.

## Reference kept off

The current guide form’s public id is `1xvkdn`. Its list id is `684175`. Its internal form id is `298803`. The vendor loader, stored only as text, is `https://cdn.sendfox.com/js/embed.js` with `data-form="1xvkdn"` and `data-api="https://sendfox.com"`. The older `https://sendfox.com/js/form.js` markup is not this loader. Lease Newsletter `261674` / `1vd796` / `586227` and the older healthcare page `232839` / `549074` are not substitutions.

`INTEGRATION_ENABLED` and `DELIVERY_ENABLED` are both false. Turning those values true in the reference function still does not mount a script, iframe, or hosted-form link from this page.

## What remains unresolved

Roger approves any later launch. These items stay open, and the page stays in the not-ready state:

1. The website embed domain is not configured, and invisible CAPTCHA is on.
2. Guide delivery is not configured or tested. The guide file is not published here, and no public guide URL is approved.
3. Privacy copy is not approved for launch. No mailing address is copied here.
4. No launch approval. This repo does not change sender settings, DNS, or From rewriting.

Custom sender-domain authentication is optional. An unverified sending domain is not, by itself, the reason this page is off.

## Local check

```bash
npm test
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/`. The signup region says nothing has been submitted and no email has been sent.
