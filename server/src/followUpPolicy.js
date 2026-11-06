"use strict";

/**
 * Spec §6.5 is documentation only.
 * Open tracking does not exist. This process does not send mail.
 * marketing_opt_in false is not consent, and consent is not collected.
 */
const followUpPolicy = Object.freeze({
  outboundSending: "off",
  manualSending: "off",
  openTelemetry: "none",
  status: "pending",
  sendsFromThisBuild: 0,
  documentedCapIfALaterSystemExists: 1,
  documentedDelay: "five-business-days-after-first-verified-open",
  notTriggers: Object.freeze([
    "form_submit",
    "thank_you_view",
    "pdf_download",
    "pageview",
    "email_sent_time",
  ]),
});

function sendFollowUp() {
  throw Object.assign(new Error("outbound_sending_off"), { code: "outbound_sending_off" });
}

module.exports = { followUpPolicy, sendFollowUp };
