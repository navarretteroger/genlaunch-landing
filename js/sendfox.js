/**
 * Reference gate for the current Customer Recovery SendFox loader.
 * The page does not mount this loader. Integration and delivery stay off.
 * The vendor file is not executed from this module.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenlaunchSendFox = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var CURRENT_PUBLIC_ID = "1xvkdn";
  var LOADER_SRC = "https://cdn.sendfox.com/js/embed.js";
  var API_ORIGIN = "https://sendfox.com";
  var LEGACY_LOADER = "https://sendfox.com/js/form.js";
  var SUBSTITUTIONS = {
    "261674": true,
    "1vd796": true,
    "586227": true,
    "232839": true,
    "549074": true
  };
  var NOT_READY = "Signup and guide delivery are not available yet. No information has been submitted and no email has been sent.";

  function isHttpUrl(value) {
    try {
      var url = new URL(String(value));
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (err) {
      return false;
    }
  }

  function isHostedForm(value) {
    if (!value || !isHttpUrl(value)) return false;
    var url = new URL(String(value));
    return url.hostname === "sendfox.com" && url.pathname.indexOf("/form/") === 0;
  }

  function referenceLoader(config) {
    var reasons = [];
    var source = config || {};
    var publicId = source.PUBLIC_FORM_ID ? String(source.PUBLIC_FORM_ID) : "";
    var loader = source.LOADER_SRC ? String(source.LOADER_SRC) : "";
    var api = source.API_ORIGIN ? String(source.API_ORIGIN) : "";
    if (source.INTEGRATION_ENABLED !== true) reasons.push("integration_disabled");
    if (source.DELIVERY_ENABLED !== true) reasons.push("delivery_disabled");
    if (SUBSTITUTIONS[publicId] || SUBSTITUTIONS[source.FORM_ID] || SUBSTITUTIONS[source.LIST_ID] || SUBSTITUTIONS[source.INTERNAL_FORM_ID]) {
      reasons.push("substitution_rejected");
    }
    if (publicId !== CURRENT_PUBLIC_ID) reasons.push("public_form_rejected");
    if (loader === LEGACY_LOADER) reasons.push("legacy_loader_rejected");
    if (loader !== LOADER_SRC) reasons.push("loader_rejected");
    if (isHostedForm(loader) || isHostedForm(api) || isHostedForm(source.HOSTED_URL) || isHostedForm(source.ACTION)) {
      reasons.push("hosted_form_rejected");
    }
    var apiUrl = null;
    try { apiUrl = new URL(api); } catch (err) { apiUrl = null; }
    if (!apiUrl || apiUrl.href !== API_ORIGIN + "/" && api !== API_ORIGIN || (apiUrl && (apiUrl.protocol !== "https:" || apiUrl.hostname !== "sendfox.com" || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash))) {
      reasons.push("api_rejected");
    }
    if (reasons.length) {
      return { matchesVendor: false, mountVendor: false, requestsProvider: false, html: "", reasons: reasons };
    }
    return {
      matchesVendor: true,
      mountVendor: false,
      requestsProvider: false,
      html: '<script src="' + LOADER_SRC + '" data-form="' + CURRENT_PUBLIC_ID + '" data-api="' + API_ORIGIN + '" async></script>',
      reasons: []
    };
  }

  function pageBehavior() {
    return { mountVendor: false, requestsProvider: false, message: NOT_READY };
  }

  return {
    CURRENT_PUBLIC_ID: CURRENT_PUBLIC_ID,
    LOADER_SRC: LOADER_SRC,
    API_ORIGIN: API_ORIGIN,
    LEGACY_LOADER: LEGACY_LOADER,
    SUBSTITUTIONS: SUBSTITUTIONS,
    NOT_READY: NOT_READY,
    isHostedForm: isHostedForm,
    referenceLoader: referenceLoader,
    pageBehavior: pageBehavior
  };
});
