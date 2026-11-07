(function () {
  "use strict";

  var fox = window.GenlaunchSendFox;
  var message = fox && fox.NOT_READY ? fox.NOT_READY : "Signup and guide delivery are not available yet. No information has been submitted and no email has been sent.";

  function show(status) {
    if (!status) return;
    status.hidden = false;
    status.textContent = message;
  }

  function deny(ev, status) {
    if (ev) {
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    }
    show(status);
  }

  function boot() {
    var region = document.getElementById("get-guide");
    var status = document.getElementById("form-status");
    var button = document.getElementById("guide-cta");
    show(status);

    if (region) {
      region.addEventListener("submit", function (ev) { deny(ev, status); }, true);
      region.addEventListener("keydown", function (ev) {
        if (ev && ev.key === "Enter") deny(ev, status);
      }, true);
      region.addEventListener("click", function (ev) {
        var target = ev && ev.target;
        var control = target && target.closest ? target.closest("#guide-cta") : null;
        if (control) deny(ev, status);
      }, true);
      var forms = region.querySelectorAll ? region.querySelectorAll("form") : [];
      for (var i = 0; i < forms.length; i += 1) {
        forms[i].submit = function (ev) { deny(ev, status); };
        forms[i].requestSubmit = function (ev) { deny(ev, status); };
      }
    }
    if (button) button.addEventListener("click", function (ev) { deny(ev, status); });
    document.addEventListener("submit", function (ev) { deny(ev, status); }, true);
    if (typeof HTMLFormElement !== "undefined" && HTMLFormElement.prototype) {
      HTMLFormElement.prototype.submit = function () { deny(null, status); };
      HTMLFormElement.prototype.requestSubmit = function () { deny(null, status); };
    }

    var sticky = document.querySelector(".sticky-cta");
    var heroCta = document.querySelector(".hero [data-cta]");
    if (sticky && heroCta && "IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        var visible = entries[0] && entries[0].isIntersecting;
        sticky.classList.toggle("is-active", !visible);
        document.body.classList.toggle("has-sticky", !visible);
      });
      observer.observe(heroCta);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
