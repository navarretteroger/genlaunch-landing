# QA — static SendFox draft

**Head intent:** unpublished GitHub Pages pages. SendFox capture is off.

- [x] H1 and CTA match the approved strings
- [x] Benefits: Identify records to review / Use the scripts / Track follow-up
- [x] About names only Roger Navarrette
- [x] No paid link, price, or checkout
- [x] Unconfigured submit does not call SendFox and does not claim an email was sent
- [x] Thank-you page does not confirm delivery or a PDF attachment
- [x] Privacy says SendFox is the future processor and that collection is off
- [x] No private guide id, Drive URL, OAuth secret, or API key in the pages
- [x] Known Lease Newsletter and older healthcare form ids are rejected by the embed gate
- [ ] Cinematic handoff (video hero, modals, bold headings, purple call to action) — not in this revision. The pages still show the earlier quiet layout.
- [ ] Current Customer Recovery SendFox form, list, embed, sender, and public guide URL — not provided
- [ ] Live provider submission — not run

`npm test` is the local check. It does not submit a form or call SendFox.
