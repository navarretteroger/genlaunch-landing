"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function boot(options) {
  const mode = options && options.storage;
  const store = new Map();
  const panels = {
    "guide-ready": { hidden: true, id: "guide-ready" },
    "guide-ready-dialog": { hidden: true, id: "guide-ready-dialog" }
  };
  const download = { id: "guide-download", focusCount: 0, focus() { this.focusCount += 1; } };
  const downloadDialog = { id: "guide-download-dialog", focusCount: 0, focus() { this.focusCount += 1; } };
  let card = null;
  let observer = null;
  const embed = {
    children: [],
    appendChild(node) { this.children.push(node); },
    querySelector(sel) {
      if (sel === ".sendfox-embed-card") return card;
      if (sel === 'input[type="email"]') return null;
      return null;
    }
  };
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
    querySelector(sel) {
      if (sel === "[data-close-guide-dialog]") return { focus() {} };
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const openers = [];
  const document = {
    documentElement: { className: "no-js" },
    getElementById(id) {
      if (id === "guide-dialog") return dialog;
      if (id === "sendfox-guide-embed") return embed;
      if (id === "sendfox-fallback") return { hidden: true, textContent: "" };
      if (id === "guide-download") return download;
      if (id === "guide-download-dialog") return downloadDialog;
      if (panels[id]) return panels[id];
      return null;
    },
    querySelector() { return null; },
    querySelectorAll(sel) {
      if (sel === "[data-open-guide-dialog]") return openers;
      return [];
    },
    addEventListener() {},
    contains() { return true; },
    activeElement: null,
    createElement() {
      return { src: "", async: false, tagName: "SCRIPT", attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, addEventListener() {} };
    },
    body: { classList: { add() {}, remove() {}, toggle() {} } }
  };
  const opener = { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, focus() {} };
  openers.push(opener);
  const sandbox = {
    document,
    console,
    setTimeout(fn, ms) { if (ms === 8000) return 0; fn(); return 0; },
    MutationObserver: function (fn) { observer = fn; this.observe = function () {}; },
    matchMedia() { return { matches: true }; },
    addEventListener() {},
    localStorage: {
      getItem(key) {
        if (mode === "throw") throw new Error("blocked");
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) { store.set(key, String(value)); }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8"), sandbox, { filename: "main.js" });
  function setCard(spec) {
    card = {
      textContent: spec.text || "",
      querySelector(sel) {
        if (sel === "form") return spec.form ? {} : null;
        if (sel === ".sendfox-embed-error") return spec.error ? {} : null;
        return null;
      }
    };
    observer();
  }
  return { opener, dialog, panels, download, downloadDialog, setCard, store, observer };
}

test("button click and a still-present form do not reveal the guide", () => {
  const page = boot();
  page.opener.listeners.click();
  page.setCard({ form: true, text: "Email" });
  assert.equal(page.panels["guide-ready"].hidden, true);
  assert.equal(page.panels["guide-ready-dialog"].hidden, true);
  assert.equal(page.download.focusCount, 0);
});

test("an error, empty card, or storage miss does not reveal the guide", () => {
  const page = boot();
  page.setCard({ form: true, text: "Email" });
  page.setCard({ error: true, text: "<img src=x onerror=alert(1)>" });
  assert.equal(page.panels["guide-ready"].hidden, true);
  page.setCard({ text: "" });
  assert.equal(page.panels["guide-ready"].hidden, true);
  page.setCard({ text: "Thanks, your signup was successful!" });
  assert.equal(page.panels["guide-ready"].hidden, true);
  assert.equal(page.panels["guide-ready"].textContent, undefined);
});

test("official success reveals both panels once and survives a second open", () => {
  const page = boot();
  page.opener.listeners.click();
  assert.equal(page.dialog.open, true);
  page.setCard({ form: true, text: "Email" });
  page.store.set("sendfox_form_done_1xvkdn", "1");
  page.setCard({ text: "Thanks, your signup was successful!" });
  assert.equal(page.panels["guide-ready"].hidden, false);
  assert.equal(page.panels["guide-ready-dialog"].hidden, false);
  assert.equal(page.downloadDialog.focusCount, 1);
  page.dialog.open = false;
  page.opener.listeners.click();
  page.observer();
  assert.equal(page.downloadDialog.focusCount, 2);
  assert.equal(page.panels["guide-ready"].hidden, false);
});

test("unreadable storage still accepts the observed official success transition", () => {
  const page = boot({ storage: "throw" });
  page.setCard({ form: true, text: "Email" });
  page.setCard({ text: "Thanks, your signup was successful!" });
  assert.equal(page.panels["guide-ready"].hidden, false);
  assert.equal(page.panels["guide-ready-dialog"].hidden, false);
});
