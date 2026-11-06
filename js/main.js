(function () {
  "use strict";

  var config = window.GENLAUNCH_CONFIG || {};
  var V = window.GenlaunchValidators;
  var endpoint = V.captureEndpoint(config);

  function $(sel) { return document.querySelector(sel); }

  function setError(input, errorEl, message) {
    if (!input || !errorEl) return;
    if (message) {
      errorEl.textContent = message;
      errorEl.classList.add("is-visible");
      input.setAttribute("aria-invalid", "true");
    } else {
      errorEl.textContent = "";
      errorEl.classList.remove("is-visible");
      input.removeAttribute("aria-invalid");
    }
  }

  function showStatus(el, message, kind) {
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    el.classList.remove("is-preview", "is-error");
    if (kind) el.classList.add(kind);
  }

  function applyMode() {
    document.body.setAttribute("data-delivery-mode", endpoint ? "production" : "preview");
    if (!endpoint) return;
    document.querySelectorAll("[data-preview-only]").forEach(function (el) {
      el.hidden = true;
    });
    var productionHelper = $("#form-helper-production");
    if (productionHelper) productionHelper.hidden = false;
  }

  function initForm() {
    var form = $("#guide-form");
    if (!form || !V) return;
    var emailInput = $("#work-email");
    var errorEl = $("#email-error");
    var statusEl = $("#form-status");
    var submitBtn = form.querySelector('[type="submit"]');
    var controller = V.createSubmitController({ createKey: V.createIdempotencyKey });

    emailInput.addEventListener("input", function () {
      setError(emailInput, errorEl, "");
      if (!controller.isInFlight()) controller.rotateKey();
      if (statusEl) {
        statusEl.hidden = true;
        statusEl.textContent = "";
      }
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var checked = V.validateCaptureFields({ email: emailInput.value });
      if (!checked.ok) {
        setError(emailInput, errorEl, checked.errors.email);
        emailInput.focus();
        return;
      }
      setError(emailInput, errorEl, "");
      var gate = controller.begin();
      if (!gate.ok) {
        showStatus(statusEl, gate.message, "is-error");
        return;
      }
      if (!endpoint) {
        controller.fail();
        showStatus(statusEl, V.PREVIEW_SUBMIT, "is-preview");
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      fetch(endpoint + "/v1/signups", {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": gate.idempotencyKey,
        },
        body: JSON.stringify({
          email: String(emailInput.value || "").trim(),
          privacyNoticeVersion: config.PRIVACY_NOTICE_VERSION,
        }),
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, body: body };
        });
      }).then(function (result) {
        var interpreted = V.interpretSignupResponse(result.status, result.body);
        if (!interpreted.ok) {
          controller.fail();
          if (interpreted.rotateKey) controller.rotateKey();
          if (submitBtn) submitBtn.disabled = false;
          showStatus(statusEl, interpreted.message, "is-error");
          return;
        }
        var record = V.buildSessionRecord(endpoint, result.body);
        sessionStorage.setItem(V.SESSION_KEY, JSON.stringify(record));
        controller.succeed();
        window.location.href = "thank-you.html";
      }).catch(function () {
        controller.fail();
        if (submitBtn) submitBtn.disabled = false;
        showStatus(statusEl, V.SAVE_FAILED, "is-error");
      });
    });
  }

  function initSticky() {
    var sticky = document.querySelector(".sticky-cta");
    var heroCta = document.querySelector(".hero [data-cta='primary']");
    if (!sticky || !heroCta || !window.IntersectionObserver) return;
    var observer = new IntersectionObserver(function (entries) {
      var visible = entries[0] && entries[0].isIntersecting;
      sticky.classList.toggle("is-active", !visible);
      document.body.classList.toggle("has-sticky", !visible);
    }, { threshold: 0.15 });
    observer.observe(heroCta);
  }

  function boot() {
    applyMode();
    initForm();
    initSticky();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
