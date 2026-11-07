"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function boot(config) {
  const created = [];
  const listeners = [];
  const status = { hidden: true, textContent: "" };
  const button = { id: "guide-cta", disabled: false };
  const form = {
    submitCalls: 0,
    requestCalls: 0,
    submit() { this.submitCalls += 1; },
    requestSubmit() { this.requestCalls += 1; }
  };
  function listen(target, type, fn, capture) {
    listeners.push({ target, type, fn, capture });
  }
  const region = {
    id: "get-guide",
    addEventListener(type, fn, capture) { listen(region, type, fn, capture); },
    querySelectorAll(selector) { return selector === "form" ? [form] : []; }
  };
  button.addEventListener = function (type, fn, capture) { listen(button, type, fn, capture); };
  const document = {
    readyState: "complete",
    getElementById(id) {
      if (id === "get-guide") return region;
      if (id === "form-status") return status;
      if (id === "guide-cta") return button;
      return null;
    },
    querySelector() { return null; },
    addEventListener(type, fn, capture) { listen(document, type, fn, capture); },
    createElement(tag) { created.push(tag); return { tag }; },
    body: { appendChild() { throw new Error("append"); }, classList: { toggle() {} } }
  };
  function HTMLFormElement() {}
  HTMLFormElement.prototype.submit = function () { form.submitCalls += 1; };
  HTMLFormElement.prototype.requestSubmit = function () { form.requestCalls += 1; };
  const fetchCalls = [];
  const sandbox = {
    console,
    Object,
    URL,
    String,
    document,
    HTMLFormElement,
    fetch(url) { fetchCalls.push(String(url)); return Promise.resolve(); }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  if (config) sandbox.window.GENLAUNCH_SENDFOX = config;
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/sendfox.js"), "utf8"), sandbox, { filename: "sendfox.js" });
  if (!config) vm.runInNewContext(fs.readFileSync(path.join(root, "js/config.js"), "utf8"), sandbox, { filename: "config.js" });
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/main.js"), "utf8"), sandbox, { filename: "main.js" });
  return { status, form, created, listeners, fetchCalls, HTMLFormElement };
}

function fire(listeners, target, type, event) {
  listeners.filter((item) => item.target === target && item.type === type).forEach((item) => item.fn(event));
}

test("disabled signup blocks click, Enter, submit, and programmatic submit", () => {
  const page = boot(null);
  assert.equal(page.created.length, 0);
  assert.equal(page.fetchCalls.length, 0);
  assert.match(page.status.textContent, /No information has been submitted and no email has been sent/);

  const region = page.listeners.find((item) => item.type === "click").target;
  let prevented = 0;
  const event = {
    key: "Enter",
    target: { closest(selector) { return selector === "#guide-cta" ? {} : null; } },
    preventDefault() { prevented += 1; },
    stopPropagation() {},
    stopImmediatePropagation() {}
  };
  fire(page.listeners, region, "click", event);
  fire(page.listeners, region, "keydown", event);
  fire(page.listeners, region, "submit", event);
  fire(page.listeners, page.listeners.find((item) => item.target !== region && item.type === "submit").target, "submit", event);
  page.form.submit();
  page.form.requestSubmit();
  page.HTMLFormElement.prototype.submit();
  page.HTMLFormElement.prototype.requestSubmit();
  assert.ok(prevented >= 4);
  assert.equal(page.form.submitCalls, 0);
  assert.equal(page.form.requestCalls, 0);
  assert.equal(page.created.length, 0);
  assert.equal(page.fetchCalls.length, 0);
  assert.equal(page.status.textContent.includes("successful"), false);
});

test("turning the reference flags on still does not create a script, iframe, or request", () => {
  const page = boot({
    INTEGRATION_ENABLED: true,
    DELIVERY_ENABLED: true,
    PUBLIC_FORM_ID: "1xvkdn",
    LIST_ID: "684175",
    INTERNAL_FORM_ID: "298803",
    LOADER_SRC: "https://cdn.sendfox.com/js/embed.js",
    API_ORIGIN: "https://sendfox.com"
  });
  assert.equal(page.created.filter((tag) => tag === "script" || tag === "iframe").length, 0);
  assert.equal(page.fetchCalls.length, 0);
  assert.match(page.status.textContent, /not available yet/);
  assert.equal(page.status.textContent.includes("successful"), false);
});
