# genlaunch-landing

GenLaunch Customer Recovery guide landing page. Static HTML, CSS and JS, no build step.

- `index.html`: page content. The signup pop-up is where the form appears.
- `styles.css`: styles, including overrides for the SendFox form
- `main.js`: pop-up, sticky button, scroll effects, and the SendFox loader

Opening the pop-up inserts the official loader `https://cdn.sendfox.com/js/embed.js` with `data-form="1xvkdn"` and `data-api="https://sendfox.com"`. The page does not load that script on first view. It does not use `https://sendfox.com/js/form.js`, and it does not use the Lease or older healthcare forms.

A SendFox message that the signup was successful is that form's response. It does not mean the guide was emailed. The guide file is not in this repository.

SendFox limits this account to subscribers who opened a message in the last 90 days, while a deliverability review is pending. This site does not turn that limit off, does not turn invisible reCAPTCHA off, and does not replace SendFox. Guide email stays blocked until SendFox permits it.

Form 298803 now has `navarretteroger.github.io` saved as an allowed domain. The list is 684175. Invisible reCAPTCHA remains on. A missing domain was a plausible cause of HTTP 422 / SF05 and is not treated as proven here. No GenLaunch automation is running. The account home that loads is `/dashboard/grow`. A different dashboard path returned 404. No private guide link is stored here.

There is no API key in these files.

`npm test` reads the page offline. It does not submit the form.
