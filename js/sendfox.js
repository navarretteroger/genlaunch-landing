/**
 * SendFox embed gate. Official legacy markup is documented at
 * https://help.sendfox.com/article/302-how-can-i-format-my-sendfox-html-form
 * and https://help.sendfox.com/article/306-how-to-create-an-embeddable-html-form
 * The recommended one-line loader is copied from SendFox only after Roger
 * publishes a current Customer Recovery form. This file does not invent that
 * snippet and does not contain an API key.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenlaunchSendFox = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var BLOCKED_IDS = {
    "261674": true,
    "1vd796": true,
    "586227": true,
    "232839": true,
    "549074": true
  };
  var ID_RE = /^[A-Za-z0-9]{4,32}$/;
  var SCRIPT_SRC = "https://sendfox.com/js/form.js";
  var EMPTY_EMAIL = "Enter your work email to continue.";
  var INVALID_EMAIL = "Enter a valid email address (for example, you@yourshop.com).";
  var NOT_READY = "Signup is not ready. Nothing was sent, and the guide was not emailed.";

  function isValidEmail(value) {
    var raw = String(value || "");
    if (/[\u0000-\u001F\u007F]/.test(raw)) return false;
    var trimmed = raw.trim();
    if (!trimmed || trimmed.length > 254) return false;
    if (/[",<>;\\()]/.test(trimmed)) return false;
    var at = trimmed.indexOf("@");
    if (at <= 0 || at !== trimmed.lastIndexOf("@")) return false;
    var local = trimmed.slice(0, at);
    var domain = trimmed.slice(at + 1);
    if (local.length > 64 || local.charAt(0) === "." || local.charAt(local.length - 1) === "." || local.indexOf("..") !== -1) return false;
    if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return false;
    var labels = domain.split(".");
    if (labels.length < 2 || domain.indexOf("..") !== -1) return false;
    for (var i = 0; i < labels.length; i += 1) {
      var label = labels[i];
      if (!label || label.length > 63 || label.charAt(0) === "-" || label.charAt(label.length - 1) === "-") return false;
      if (!/^[A-Za-z0-9-]+$/.test(label) && !/^[\p{L}\p{N}-]+$/u.test(label)) return false;
    }
    return true;
  }

  function assess(config) {
    var reasons = [];
    var formId = config && config.FORM_ID ? String(config.FORM_ID) : "";
    var publicId = config && config.PUBLIC_ID ? String(config.PUBLIC_ID) : "";
    if (!config || config.OFFER_REVIEWED !== true) reasons.push("offer_not_reviewed");
    if (!formId) reasons.push("form_id_missing");
    else if (!ID_RE.test(formId) || BLOCKED_IDS[formId]) reasons.push("form_id_rejected");
    if (!publicId) reasons.push("public_id_missing");
    else if (!ID_RE.test(publicId) || BLOCKED_IDS[publicId]) reasons.push("public_id_rejected");
    var canonical = formId && publicId ? "https://sendfox.com/form/" + formId + "/" + publicId : "";
    if (config && Object.prototype.hasOwnProperty.call(config, "ACTION")) {
      var given = String(config.ACTION || "");
      var parsed = null;
      try { parsed = new URL(given); } catch (err) { parsed = null; }
      if (!parsed || parsed.protocol !== "https:" || parsed.hostname !== "sendfox.com" || parsed.pathname !== "/form/" + formId + "/" + publicId || parsed.search || parsed.hash || parsed.username || parsed.password || given !== canonical) {
        reasons.push("action_rejected");
      }
    }
    if (reasons.length) {
      return { ok: false, reasons: reasons, requestsProvider: false };
    }
    var action = "https://sendfox.com/form/" + formId + "/" + publicId;
    var url = new URL(action);
    if (url.protocol !== "https:" || url.hostname !== "sendfox.com" || url.pathname !== "/form/" + formId + "/" + publicId || url.search || url.username || url.password) {
      return { ok: false, reasons: ["action_rejected"], requestsProvider: false };
    }
    return {
      ok: true,
      reasons: [],
      requestsProvider: true,
      method: "post",
      action: action,
      scriptSrc: SCRIPT_SRC,
      formClass: "sendfox-form",
      async: true,
      emailName: "email",
      honeypotName: "a_password"
    };
  }

  function legacyMarkup(embed) {
    if (!embed || !embed.ok) return "";
    return [
      '<form method="post" action="' + embed.action + '" class="sendfox-form" data-async="true" data-recaptcha="false">',
      '<label for="sendfox_form_email">Work email</label>',
      '<input id="sendfox_form_email" type="email" name="email" required />',
      '<div aria-hidden="true"><input type="text" name="a_password" tabindex="-1" value="" autocomplete="off" /></div>',
      '<button type="submit">Get the free Customer Recovery guide.</button>',
      "</form>",
      '<script src="' + embed.scriptSrc + '" charset="utf-8"></script>'
    ].join("");
  }

  return {
    BLOCKED_IDS: BLOCKED_IDS,
    SCRIPT_SRC: SCRIPT_SRC,
    EMPTY_EMAIL: EMPTY_EMAIL,
    INVALID_EMAIL: INVALID_EMAIL,
    NOT_READY: NOT_READY,
    isValidEmail: isValidEmail,
    assess: assess,
    legacyMarkup: legacyMarkup
  };
});
