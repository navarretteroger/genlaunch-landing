(function () {
  "use strict";

  var config = window.GENLAUNCH_CONFIG || {};
  var V = window.GenlaunchValidators;
  var preview = document.getElementById("preview-thank-you");
  var production = document.getElementById("production-thank-you");
  var inactive = document.getElementById("grant-inactive");
  var downloadBtn = document.getElementById("download-btn");
  var note = document.getElementById("download-note");
  var duplicateNote = document.getElementById("duplicate-note");

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function hidePreviewChrome() {
    document.querySelectorAll("[data-preview-only]").forEach(function (el) { el.hidden = true; });
  }

  function setNote(message) {
    if (note) note.textContent = message;
  }

  function readSession() {
    try {
      var raw = sessionStorage.getItem(V.SESSION_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function activateDownload(session) {
    hide(preview);
    hide(inactive);
    show(production);
    hidePreviewChrome();
    document.body.setAttribute("data-delivery-mode", "production");
    if (duplicateNote) {
      duplicateNote.hidden = session.duplicate !== true;
    }
    if (!downloadBtn) return;
    downloadBtn.disabled = false;
    downloadBtn.setAttribute("aria-disabled", "false");
    downloadBtn.addEventListener("click", function () {
      downloadBtn.disabled = true;
      var endpoint = V.captureEndpoint(config);
      fetch(endpoint + "/v1/guide", {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        headers: {
          Authorization: "Bearer " + session.downloadToken,
          Accept: "application/pdf",
        },
      }).then(function (res) {
        var type = res.headers.get("content-type") || "";
        if (!res.ok || type.indexOf("application/pdf") === -1) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            throw new Error(body.message || "The server did not return the guide.");
          });
        }
        return res.blob();
      }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "Customer-Recovery-Guide.pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setNote("The guide file was saved from this site. It was not emailed, and the private Drive file was not opened.");
        downloadBtn.disabled = false;
      }).catch(function (err) {
        setNote(err && err.message ? err.message : "The guide file was not downloaded.");
        downloadBtn.disabled = false;
      });
    });
  }

  var session = readSession();
  var gate = V.canActivateDownload(config, session, Date.now());
  if (gate.ok) {
    activateDownload(session);
  } else if (V.captureEndpoint(config)) {
    hide(preview);
    hide(production);
    show(inactive);
    hidePreviewChrome();
    document.body.setAttribute("data-delivery-mode", "production");
    if (gate.reason === "expired") {
      var expired = document.getElementById("inactive-detail");
      if (expired) expired.textContent = "The download token in this tab has expired. Submit the form again to request a new one. Nothing was emailed.";
    }
  } else {
    show(preview);
    hide(production);
    hide(inactive);
    document.body.setAttribute("data-delivery-mode", "preview");
  }
})();
