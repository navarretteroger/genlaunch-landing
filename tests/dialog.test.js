"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

test("opening the dialog adds the official loader and does not post", () => {
  const created = [];
  const listeners = [];
  const fallback = { hidden: true, textContent: "" };
  const embed = {
    children: [],
    appendChild(node) { this.children.push(node); created.push(node); },
    querySelector() { return null; }
  };
  const closeBtn = {};
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
    querySelector(sel) {
      if (sel === "[data-close-guide-dialog]") return closeBtn;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { listeners.push({ type, fn }); }
  };
  const openers = [];
  const document = {
    documentElement: { className: "no-js", classList: { remove() {}, add() {} } },
    getElementById(id) {
      if (id === "guide-dialog") return dialog;
      if (id === "sendfox-guide-embed") return embed;
      if (id === "sendfox-fallback") return fallback;
      return null;
    },
    querySelector() { return null; },
    querySelectorAll(sel) {
      if (sel === "[data-open-guide-dialog]") return openers;
      if (sel === ".reveal") return [];
      return [];
    },
    addEventListener() {},
    contains() { return true; },
    activeElement: null,
    createElement() {
      return {
        src: "",
        async: false,
        tagName: "SCRIPT",
        attrs: {},
        setAttribute(name, value) { this.attrs[name] = value; },
        addEventListener() {}
      };
    },
    body: { classList: { add() {}, remove() {}, toggle() {} } }
  };
  function makeButton() {
    const button = {
      listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      focus() {}
    };
    openers.push(button);
    return button;
  }
  const opener = makeButton();
  closeBtn.focus = function () {};
  const sandbox = {
    document,
    console,
    setTimeout(fn, ms) {
      if (ms === 8000) return 0;
      fn();
      return 0;
    },
    MutationObserver: function () { this.observe = function () {}; },
    matchMedia() { return { matches: true }; },
    addEventListener() {},
    fetch() { throw new Error("fetch blocked"); },
    XMLHttpRequest: function () { throw new Error("xhr blocked"); }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8"), sandbox, { filename: "main.js" });
  assert.equal(created.length, 0);
  opener.listeners.click();
  assert.equal(dialog.open, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].src, "https://cdn.sendfox.com/js/embed.js");
  assert.equal(created[0].async, true);
  assert.equal(created[0].attrs["data-form"], "1xvkdn");
  assert.equal(created[0].attrs["data-api"], "https://sendfox.com");
  assert.equal(fallback.textContent, "The signup form is loading.");
  opener.listeners.click();
  assert.equal(created.length, 1);
});
