/* GenLaunch Customer Recovery Guide landing page.
   The official SendFox loader for form 1xvkdn is added when the pop-up opens.
   This script does not send the form and does not include an API key. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var dialog = document.getElementById("guide-dialog");
  var embed = document.getElementById("sendfox-guide-embed");
  var fallback = document.getElementById("sendfox-fallback");
  var opener = null;
  var embedStarted = false;
  var focusedEmail = false;
  var FORM_ID = "1xvkdn";
  var LOADER_SRC = "https://cdn.sendfox.com/js/embed.js";
  var API_ORIGIN = "https://sendfox.com";
  var sawSignupForm = false;
  var guideRevealed = false;

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
    if (guideRevealed) {
      var readyLink = document.getElementById("guide-download-dialog");
      if (readyLink) {
        readyLink.focus();
        return;
      }
    }
    var field = embed && embed.querySelector('input[type="email"]');
    if (field) {
      if (!focusedEmail) {
        focusedEmail = true;
        field.focus();
      }
      return;
    }
    var closeBtn = dialog && dialog.querySelector("[data-close-guide-dialog]");
    if (closeBtn) closeBtn.focus();
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
    focusedEmail = false;
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

  /* ---------- SendFox embed ---------- */
  // The loader is the official snippet. It is added after the dialog is open
  // so the page does not contact SendFox before the visitor asks for the form.
  // This file does not post the form and cannot change a provider 422.
  function embedRendered() {
    if (!embed) return false;
    return Array.prototype.some.call(embed.children, function (el) {
      return el.tagName !== "SCRIPT";
    });
  }
  function showFallback(text) {
    if (!fallback) return;
    fallback.hidden = false;
    fallback.textContent = text;
  }
  function checkEmbed() {
    if (!embedStarted || !embedRendered()) return;
    if (fallback) fallback.hidden = true;
    focusFirstField();
  }
  function storageConfirms() {
    try {
      return window.localStorage.getItem("sendfox_form_done_" + FORM_ID) === "1";
    } catch (err) {
      return null;
    }
  }
  function considerGuide() {
    if (guideRevealed || !embed || !embed.querySelector) return;
    var card = embed.querySelector(".sendfox-embed-card");
    if (!card || !card.querySelector) return;
    if (card.querySelector("form")) {
      sawSignupForm = true;
      return;
    }
    if (card.querySelector(".sendfox-embed-error")) return;
    var text = String(card.textContent || "").replace(/\s+/g, " ").trim();
    if (!sawSignupForm || !text) return;
    if (storageConfirms() === false) return;
    guideRevealed = true;
    ["guide-ready", "guide-ready-dialog"].forEach(function (id) {
      var panel = document.getElementById(id);
      if (panel) panel.hidden = false;
    });
    var download = dialog && dialog.open ? document.getElementById("guide-download-dialog") : null;
    if (!download) download = document.getElementById("guide-download");
    if (download && download.focus) download.focus();
  }
  function onEmbedChange() {
    checkEmbed();
    considerGuide();
  }
  function markEmbedFailed() {
    if (!embedRendered()) {
      showFallback("The signup form didn't load. Please refresh the page and try again.");
    }
  }
  function startEmbed() {
    if (embedStarted || !embed) return;
    embedStarted = true;
    showFallback("The signup form is loading.");
    var script = document.createElement("script");
    script.src = LOADER_SRC;
    script.async = true;
    script.setAttribute("data-form", FORM_ID);
    script.setAttribute("data-api", API_ORIGIN);
    script.addEventListener("error", markEmbedFailed);
    embed.appendChild(script);
    window.setTimeout(markEmbedFailed, 8000);
  }
  if (embed && "MutationObserver" in window) {
    new MutationObserver(onEmbedChange).observe(embed, { childList: true, subtree: true });
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
