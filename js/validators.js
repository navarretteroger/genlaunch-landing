/**
 * Shared validation and signup-protocol helpers (browser + Node).
 * Messages match Landing Page Build Spec §6.4.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenlaunchValidators = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var EMPTY_EMAIL = "Enter your work email to continue.";
  var INVALID_EMAIL = "Enter a valid email address (for example, you@yourshop.com).";
  var IN_FLIGHT = "You\u2019re already submitting\u2014please wait.";
  var PREVIEW_SUBMIT = "Thanks\u2014this is a preview. Nothing was stored and no PDF download was fulfilled.";
  var SAVE_FAILED = "We couldn\u2019t save that just now. Wait a moment and try again. If it keeps failing, contact Roger directly\u2014don\u2019t assume the guide downloaded.";
  var EMPTY_FIRST_NAME = "Enter your first name.";
  var LONG_FIRST_NAME = "Use a shorter first name (40 characters or fewer).";
  var SESSION_KEY = "genlaunch.guideGrant.v1";

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

  function validateCaptureFields(fields, options) {
    options = options || {};
    var errors = {};
    var email = fields && fields.email;
    var firstName = fields && fields.firstName;
    if (!String(email || "").trim()) errors.email = EMPTY_EMAIL;
    else if (!isValidEmail(email)) errors.email = INVALID_EMAIL;
    if (options.requireFirstName) {
      if (!String(firstName || "").trim()) errors.firstName = EMPTY_FIRST_NAME;
      else if (String(firstName).trim().length > 40) errors.firstName = LONG_FIRST_NAME;
    }
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  function captureEndpoint(config) {
    if (!config || config.DELIVERY_MODE !== "production") return null;
    if (!config.CAPTURE_API_BASE || !config.SUPPORT_CONTACT) return null;
    return String(config.CAPTURE_API_BASE).replace(/\/$/, "");
  }

  function createIdempotencyKey() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    throw new Error("crypto.randomUUID is required");
  }

  function createSubmitController(options) {
    var createKey = options.createKey;
    var inFlight = false;
    var key = null;
    return {
      begin: function () {
        if (inFlight) return { ok: false, message: IN_FLIGHT };
        inFlight = true;
        if (!key) key = createKey();
        return { ok: true, idempotencyKey: key };
      },
      fail: function () { inFlight = false; },
      succeed: function () { inFlight = false; key = null; },
      rotateKey: function () { if (!inFlight) key = null; },
      isInFlight: function () { return inFlight; },
      currentKey: function () { return key; },
    };
  }

  function interpretSignupResponse(status, body) {
    body = body || {};
    if ((status === 200 || status === 201) && body.ok === true && typeof body.downloadToken === "string" && body.downloadToken && body.downloadExpiresAt) {
      return { ok: true };
    }
    if (status === 409) {
      return {
        ok: false,
        rotateKey: true,
        message: body.message || "This submission key was already used for a different request. Reload the page and try again.",
      };
    }
    return {
      ok: false,
      rotateKey: false,
      message: body.message || SAVE_FAILED,
    };
  }

  function buildSessionRecord(apiBase, response) {
    return {
      apiBase: apiBase,
      downloadToken: response.downloadToken,
      downloadExpiresAt: response.downloadExpiresAt,
      privacyNoticeVersion: response.privacyNoticeVersion,
    };
  }

  function canActivateDownload(config, session, nowMs) {
    var endpoint = captureEndpoint(config);
    if (!endpoint) return { ok: false, reason: "not_production" };
    if (!session || typeof session.downloadToken !== "string" || !session.downloadExpiresAt) {
      return { ok: false, reason: "no_grant" };
    }
    if (session.apiBase !== endpoint) return { ok: false, reason: "api_mismatch" };
    var exp = Date.parse(session.downloadExpiresAt);
    if (!Number.isFinite(exp) || exp <= nowMs) return { ok: false, reason: "expired" };
    return { ok: true };
  }

  return {
    EMPTY_EMAIL: EMPTY_EMAIL,
    INVALID_EMAIL: INVALID_EMAIL,
    IN_FLIGHT: IN_FLIGHT,
    PREVIEW_SUBMIT: PREVIEW_SUBMIT,
    SAVE_FAILED: SAVE_FAILED,
    EMPTY_FIRST_NAME: EMPTY_FIRST_NAME,
    LONG_FIRST_NAME: LONG_FIRST_NAME,
    SESSION_KEY: SESSION_KEY,
    isValidEmail: isValidEmail,
    validateCaptureFields: validateCaptureFields,
    captureEndpoint: captureEndpoint,
    createIdempotencyKey: createIdempotencyKey,
    createSubmitController: createSubmitController,
    interpretSignupResponse: interpretSignupResponse,
    buildSessionRecord: buildSessionRecord,
    canActivateDownload: canActivateDownload,
  };
});
