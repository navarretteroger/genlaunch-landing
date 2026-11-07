# genlaunch-landing

GenLaunch Customer Recovery guide landing page. Static HTML, CSS and JS, no build step.

- `index.html`: page content. The signup pop-up is where the form appears.
- `styles.css`: styles, including overrides for the SendFox form
- `main.js`: pop-up, sticky button, scroll effects, and the SendFox loader

Opening the pop-up inserts the official loader `https://cdn.sendfox.com/js/embed.js` with `data-form="1xvkdn"` and `data-api="https://sendfox.com"`. The page does not load that script on first view. It does not use `https://sendfox.com/js/form.js`, and it does not use the Lease or older healthcare forms.

The download stays hidden until the official SendFox loader shows its own success state. That loader posts the form itself. After an HTTP 200 with no redirect, it stores `sendfox_form_done_1xvkdn` and replaces the form card with its success message. This page reveals the download only after it has seen that form card and then seen the card lose the form, keep no error, and gain that message, with the stored flag agreeing when storage can be read. A button click, a validation block, a network error, or an error message does not reveal it.

The download link is the public Drive file `10TYZ6g7IpG6RYvpz2dKq9E43R8jqxzWb`. A request to `https://drive.google.com/uc?export=download&id=10TYZ6g7IpG6RYvpz2dKq9E43R8jqxzWb` returns 303 to `drive.usercontent.google.com`, which returns 200 `application/octet-stream` with `Content-Disposition: attachment` and the filename `Customer Recovery Guide — Simple Edition.pdf`. The view link returns `text/html`. The HTML `download` attribute is not used: browsers ignore it on a cross-origin address, so it would not decide the save. A `crossorigin` attribute on the link does not change that navigation. The file is not copied into this repository.

Check-inbox copy is for the emailed copy and does not say the message has already arrived. Confirming the email does not gate the on-page download. Invisible reCAPTCHA stays on. This repository does not change SendFox, the form, the domain list, or automations. No private guide link is stored here.

There is no API key in these files.

`npm test` reads the page offline. It does not submit the form.
