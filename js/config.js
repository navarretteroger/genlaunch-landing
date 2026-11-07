/**
 * Public SendFox settings only. Empty and unreviewed means the page must not
 * load SendFox or claim the guide was emailed. No API key belongs here.
 * Roger approves a current Customer Recovery form before these fields change.
 */
window.GENLAUNCH_SENDFOX = Object.freeze({
  OFFER_REVIEWED: false,
  FORM_ID: "",
  PUBLIC_ID: ""
});
