(function () {
  "use strict";
  var config = window.GENLAUNCH_CONFIG || {};
  var validators = window.GenlaunchValidators;
  var endpoint = validators && validators.captureEndpoint(config);
  document.body.setAttribute("data-delivery-mode", endpoint ? "production" : "preview");
  if (!endpoint) return;
  document.querySelectorAll("[data-preview-only]").forEach(function (el) {
    el.hidden = true;
  });
  document.querySelectorAll("[data-production-only]").forEach(function (el) {
    el.hidden = false;
  });
  if (config.SUPPORT_CONTACT) {
    document.querySelectorAll("[data-support-contact]").forEach(function (el) {
      el.textContent = String(config.SUPPORT_CONTACT);
    });
  }
})();
