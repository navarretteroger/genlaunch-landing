/**
 * Public page config. Default is preview: no capture and no download.
 * Production requires a reviewed change that sets DELIVERY_MODE to "production"
 * and CAPTURE_API_BASE to the deployed API origin (https, no secret).
 * Never put OAuth secrets, the grant signing secret, or a Drive URL here.
 */
window.GENLAUNCH_CONFIG = Object.freeze({
  DELIVERY_MODE: "preview",
  CAPTURE_API_BASE: null,
  PRIVACY_NOTICE_VERSION: "2026-11-06",
  PRIVACY_PATH: "privacy.html",
  CTA_PRIMARY: "Get the free Customer Recovery guide.",
  DOWNLOAD_BUTTON_LABEL: "Download the Customer Recovery guide (PDF)",
  GUIDE_TITLE: "Find More Work in Your CRM — Customer Recovery Guide",
  GUIDE_PAGES_CLAIM: "~10-page",
  SUPPORT_CONTACT: null,
});
