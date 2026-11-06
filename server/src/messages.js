"use strict";

/** Spec §6.4 strings. Apostrophes and dashes match the build spec. */
const EMPTY_EMAIL = "Enter your work email to continue.";
const INVALID_EMAIL = "Enter a valid email address (for example, you@yourshop.com).";
const IN_FLIGHT = "You\u2019re already submitting\u2014please wait.";
const PREVIEW_SUBMIT = "Thanks\u2014this is a preview. Nothing was stored and no PDF download was fulfilled.";
const SAVE_FAILED = "We couldn\u2019t save that just now. Wait a moment and try again. If it keeps failing, contact Roger directly\u2014don\u2019t assume the guide downloaded.";
const EMPTY_FIRST_NAME = "Enter your first name.";
const LONG_FIRST_NAME = "Use a shorter first name (40 characters or fewer).";

module.exports = {
  EMPTY_EMAIL,
  INVALID_EMAIL,
  IN_FLIGHT,
  PREVIEW_SUBMIT,
  SAVE_FAILED,
  EMPTY_FIRST_NAME,
  LONG_FIRST_NAME,
};
