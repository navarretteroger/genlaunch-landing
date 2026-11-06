"use strict";

/**
 * Google Picker plus drive.file grants this app access to the files the owner
 * picks. That is not a Drive sharing-permission change and not a service account.
 * https://developers.google.com/workspace/sheets/api/scopes
 * https://developers.google.com/workspace/drive/api/guides/api-specific-auth
 */
function expectedOwnerFiles(config) {
  return {
    spreadsheetId: config.sheetId,
    pdfFileId: config.driveFileId,
  };
}

function evaluateOwnerPicks(picks, expected) {
  const spreadsheetId = picks && picks.spreadsheetId;
  const pdfFileId = picks && picks.pdfFileId;
  if (spreadsheetId !== expected.spreadsheetId || pdfFileId !== expected.pdfFileId) {
    return { ok: false, reason: "picked_files_do_not_match" };
  }
  return { ok: true };
}

function renderPickerPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="referrer" content="no-referrer" />
  <title>Choose the signup sheet and the guide</title>
</head>
<body>
  <p id="status">Loading the file picker.</p>
  <script src="https://apis.google.com/js/api.js"></script>
  <script>
    var SPREADSHEET = "application/vnd.google-apps.spreadsheet";
    var PDF = "application/pdf";
    function pick(session, mime, title) {
      return new Promise(function (resolve) {
        var view = new google.picker.DocsView(google.picker.ViewId.DOCS);
        view.setMimeTypes(mime);
        var picker = new google.picker.PickerBuilder()
          .setAppId(session.appId)
          .setOAuthToken(session.accessToken)
          .setDeveloperKey(session.apiKey)
          .setTitle(title)
          .addView(view)
          .setCallback(function (data) {
            if (data.action === google.picker.Action.PICKED && data.docs && data.docs[0]) {
              resolve(data.docs[0].id);
            } else if (data.action === google.picker.Action.CANCEL) {
              resolve("");
            }
          })
          .build();
        picker.setVisible(true);
      });
    }
    fetch("/picker-session", { credentials: "same-origin", cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (session) {
        gapi.load("picker", function () {
          pick(session, SPREADSHEET, "Select the signup spreadsheet")
            .then(function (spreadsheetId) {
              return pick(session, PDF, "Select the Customer Recovery PDF").then(function (pdfFileId) {
                return { spreadsheetId: spreadsheetId, pdfFileId: pdfFileId };
              });
            })
            .then(function (picked) {
              return fetch("/picked", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(picked)
              });
            })
            .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
            .then(function (result) {
              document.getElementById("status").textContent = result.ok
                ? "Those files were authorized for this app. You can close this window. The refresh token was written only to the file you chose."
                : "The picked files were not the confirmed signup sheet and guide. Pick those two files. Nothing was shared with another account.";
            });
        });
      });
  </script>
</body>
</html>`;
}

module.exports = {
  expectedOwnerFiles,
  evaluateOwnerPicks,
  renderPickerPage,
};
