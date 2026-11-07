# QA — static SendFox draft

**Head intent:** unpublished GitHub Pages pages. The current guide embed is referenced and left off.

- [x] H1 and CTA match the approved strings
- [x] Benefits: Identify records to review / Use the scripts / Track follow-up
- [x] About names only Roger Navarrette
- [x] Signup region stays after About and before the privacy notice
- [x] Not-ready copy says nothing was submitted and no email was sent
- [x] Disabled page has no vendor script, iframe, or hosted-form link
- [x] Current loader is `https://cdn.sendfox.com/js/embed.js` with public id `1xvkdn`
- [x] Legacy `form.js`, Lease ids, and the older healthcare ids are rejected
- [x] No private guide id, Drive URL, OAuth secret, or API key in the pages
- [ ] Cinematic handoff (video hero, modals, bold headings, purple call to action) — not in this revision. The pages still show the earlier quiet layout.
- [ ] Embed domain, guide delivery, public guide URL, privacy approval, and launch approval — unresolved
- [ ] Live provider submission — not run

`npm test` is the local check. It does not submit a form or call SendFox.
