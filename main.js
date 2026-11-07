/* GenLaunch Customer Recovery Guide landing page.
   Email capture is the SendFox embed (form 1xvkdn) inside the signup pop-up.
   The official SendFox loader is added when the pop-up opens.
   This script does not send the form. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var dialog = document.getElementById("guide-dialog");
  var embed = document.getElementById("sendfox-guide-embed");
  var fallback = document.getElementById("sendfox-fallback");
  var opener = null;
  var embedStarted = false;

  /* ---------- Dialog ---------- */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

  function focusables() {
    return Array.prototype.filter.call(dialog.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function setPageInert(on) {
    ["main", ".nav-wrap", ".footer", "#sticky-cta", ".skip-link"].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      if (on) { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); }
      else { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
    });
  }

  function openDialog(trigger) {
    if (!dialog || dialog.open) return;
    opener = trigger || document.activeElement;
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    document.body.classList.add("dialog-open");
    setPageInert(true);
    startEmbed();
    window.setTimeout(focusFirstField, 10);
  }

  // Focus the SendFox email field if it rendered, otherwise the Close button.
  function focusFirstField() {
    var field = embed && embed.querySelector('input[type="email"]');
    if (!field) field = dialog.querySelector("[data-close-guide-dialog]");
    if (field) field.focus();
  }

  function closeDialog() {
    if (!dialog || !dialog.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    // Re-enable the page right away so focus can move to it in the same tick.
    document.body.classList.remove("dialog-open");
    setPageInert(false);
  }

  function onClosed() {
    document.body.classList.remove("dialog-open");
    setPageInert(false);
    if (opener && typeof opener.focus === "function" && document.contains(opener)) {
      opener.focus();
    }
    opener = null;
  }

  if (dialog) {
    document.querySelectorAll("[data-open-guide-dialog]").forEach(function (btn) {
      btn.addEventListener("click", function () { openDialog(btn); });
    });
    dialog.querySelectorAll("[data-close-guide-dialog]").forEach(function (btn) {
      btn.addEventListener("click", closeDialog);
    });
    dialog.addEventListener("close", onClosed);
    dialog.addEventListener("cancel", function (e) {
      // Escape key: close normally (native), then restore focus via onClosed.
      e.preventDefault();
      closeDialog();
    });
    // Click on the backdrop (outside the dialog box) closes it.
    dialog.addEventListener("mousedown", function (e) {
      if (e.target !== dialog) return;
      var r = dialog.getBoundingClientRect();
      var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeDialog();
    });
    // Focus trap (backup for browsers whose modal dialog lets Tab escape).
    dialog.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !(typeof dialog.showModal === "function")) {
        e.preventDefault();
        closeDialog();
        return;
      }
      if (e.key !== "Tab") return;
      var items = focusables();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });
    // Privacy link inside the dialog: close, then move to the privacy text.
    var privacyLink = dialog.querySelector("[data-privacy-link]");
    if (privacyLink) {
      privacyLink.addEventListener("click", function (e) {
        e.preventDefault();
        opener = null;
        closeDialog();
        var target = document.getElementById("privacy");
        if (target) {
          target.setAttribute("tabindex", "-1");
          target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
          target.focus({ preventScroll: true });
          target.classList.add("flash");
          window.setTimeout(function () { target.classList.remove("flash"); }, 2400);
        }
      });
    }
  }

  /* ---------- SendFox embed check ---------- */
  // SendFox only renders the form on a domain allowed in its form settings.
  // If nothing has rendered a few seconds after load, say so honestly.
  function embedRendered() {
    if (!embed) return false;
    return Array.prototype.some.call(embed.children, function (el) {
      return el.tagName !== "SCRIPT";
    });
  }
  function checkEmbed() {
    if (fallback) fallback.hidden = embedRendered();
  }
  function startEmbed() {
    if (embedStarted || !embed) return;
    embedStarted = true;
    if (fallback) {
      fallback.hidden = false;
      fallback.textContent = "The signup form is loading.";
    }
    var script = document.createElement("script");
    script.src = "https://cdn.sendfox.com/js/embed.js";
    script.async = true;
    script.setAttribute("data-form", "1xvkdn");
    script.setAttribute("data-api", "https://sendfox.com");
    script.addEventListener("error", function () {
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = "The signup form didn't load. Please refresh the page and try again.";
      }
    });
    embed.appendChild(script);
    window.setTimeout(function () {
      if (!embedRendered() && fallback) {
        fallback.hidden = false;
        fallback.textContent = "The signup form didn't load. Please refresh the page and try again.";
      }
    }, 8000);
  }
  if (embed && "MutationObserver" in window) {
    new MutationObserver(checkEmbed).observe(embed, { childList: true, subtree: true });
  }

  /* ---------- Nav morph ---------- */
  var nav = document.querySelector(".nav");
  function onScroll() {
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Scroll reveals ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Sticky mobile CTA ---------- */
  var sticky = document.getElementById("sticky-cta");
  // Hide the sticky bar while another guide button is already on screen.
  var hideFor = [document.querySelector(".hero-actions"), document.getElementById("get-guide")];
  if (sticky && "IntersectionObserver" in window) {
    var visible = new Set();
    var stickyIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      sticky.classList.toggle("is-hidden", visible.size > 0);
    }, { threshold: 0.1 });
    hideFor.forEach(function (el) { if (el) stickyIO.observe(el); });
  }
})();
