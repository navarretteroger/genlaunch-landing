# genlaunch-landing

GenLaunch Customer Recovery guide landing page. Static HTML, CSS and JS, no build step.

- `index.html`: page content. The signup pop-up is where the form appears.
- `styles.css`: styles, including overrides for the SendFox form
- `main.js`: pop-up, sticky button, scroll effects, and the SendFox loader

Opening the pop-up inserts the official loader `https://cdn.sendfox.com/js/embed.js` with `data-form="1xvkdn"` and `data-api="https://sendfox.com"`. The page does not load that script on first view. It does not use `https://sendfox.com/js/form.js`, and it does not use the Lease or older healthcare forms.

A SendFox message that the signup was successful is that form's response. It does not mean the guide was emailed. Guide delivery is not set up on this site, and the guide file is not published here.

The form's allowed website domain and its invisible reCAPTCHA are SendFox settings. This repository cannot change them. There is no API key in these files.

`npm test` reads the page offline. It does not submit the form.
