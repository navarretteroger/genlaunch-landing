(function () {
  "use strict";

  var fox = window.GenlaunchSendFox;
  var config = window.GENLAUNCH_SENDFOX || {};
  var embed = fox.assess(config);

  function setError(input, errorEl, message) {
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

  function boot() {
    var form = document.getElementById("guide-form");
    var input = document.getElementById("work-email");
    var errorEl = document.getElementById("email-error");
    var status = document.getElementById("form-status");
    if (!form || !input) return;
    if (embed.ok) {
      form.action = embed.action;
      form.method = "post";
      form.classList.add(embed.formClass);
      form.setAttribute("data-async", "true");
      form.setAttribute("data-recaptcha", "false");
      var script = document.createElement("script");
      script.src = embed.scriptSrc;
      script.charset = "utf-8";
      document.body.appendChild(script);
    }
    form.addEventListener("submit", function (ev) {
      var value = input.value;
      if (!String(value || "").trim()) {
        ev.preventDefault();
        setError(input, errorEl, fox.EMPTY_EMAIL);
        input.focus();
        return;
      }
      if (!fox.isValidEmail(value)) {
        ev.preventDefault();
        setError(input, errorEl, fox.INVALID_EMAIL);
        input.focus();
        return;
      }
      setError(input, errorEl, "");
      if (!embed.ok) {
        ev.preventDefault();
        status.hidden = false;
        status.classList.add("is-preview");
        status.textContent = fox.NOT_READY;
        return;
      }
    });

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
