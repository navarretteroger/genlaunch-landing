"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function boot(config, inputValue) {
  const created = [];
  const form = {
    action: "#get-guide",
    method: "post",
    classList: { add() {} },
    setAttribute() {},
    addEventListener(type, fn) { this["on" + type] = fn; }
  };
  const input = {
    value: inputValue,
    setAttribute() {},
    removeAttribute() {},
    focus() {}
  };
  const errorEl = {
    textContent: "",
    classList: { add() {}, remove() {} }
  };
  const status = {
    hidden: true,
    textContent: "",
    classList: { add() {} }
  };
  const document = {
    readyState: "complete",
    getElementById(id) {
      if (id === "guide-form") return form;
      if (id === "work-email") return input;
      if (id === "email-error") return errorEl;
      if (id === "form-status") return status;
      return null;
    },
    querySelector() { return null; },
    createElement(tag) {
      const el = { tag, src: "", charset: "" };
      created.push(el);
      return el;
    },
    body: { appendChild(el) { this.last = el; }, classList: { toggle() {} } }
  };
  const sandbox = { console, Object, URL, String, document };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  if (config) sandbox.window.GENLAUNCH_SENDFOX = config;
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/sendfox.js"), "utf8"), sandbox, { filename: "sendfox.js" });
  if (!config) {
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/config.js"), "utf8"), sandbox, { filename: "config.js" });
  }
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/main.js"), "utf8"), sandbox, { filename: "main.js" });
  return { form, status, errorEl, created, document };
}

function submit(form) {
  let prevented = false;
  let navigated = false;
  form.onsubmit({
    preventDefault() { prevented = true; },
    stopPropagation() { navigated = true; }
  });
  return { prevented, navigated };
}

test("shipped page blocks a valid email and does not load SendFox", () => {
  const page = boot(null, "you@yourshop.com");
  const result = submit(page.form);
  assert.equal(result.prevented, true);
  assert.equal(result.navigated, false);
  assert.equal(page.form.action, "#get-guide");
  assert.equal(page.created.length, 0);
  assert.match(page.status.textContent, /Nothing was sent/);
  assert.match(page.status.textContent, /was not emailed/);
  assert.equal(page.status.textContent.includes("in the email"), false);
});

test("a reviewed fixture points at the official form and still does not claim delivery", () => {
  const page = boot({
    OFFER_REVIEWED: true,
    FORM_ID: "crmguideform1",
    PUBLIC_ID: "publicfixture1"
  }, "you@yourshop.com");
  const result = submit(page.form);
  assert.equal(result.prevented, false);
  assert.equal(page.form.action, "https://sendfox.com/form/crmguideform1/publicfixture1");
  assert.equal(page.created.length, 1);
  assert.equal(page.created[0].src, "https://sendfox.com/js/form.js");
  assert.equal(page.status.textContent, "");
  assert.equal(page.document.body.last.src, "https://sendfox.com/js/form.js");
});

test("invalid email stays on the page with a format error", () => {
  const page = boot(null, "not-an-email");
  const result = submit(page.form);
  assert.equal(result.prevented, true);
  assert.match(page.errorEl.textContent, /valid email address/);
  assert.equal(page.status.textContent, "");
  assert.equal(page.form.action, "#get-guide");
});
