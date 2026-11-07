"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

const html = read("index.html");
const js = read("main.js");
const css = read("styles.css");
const pages = html + "\n" + js + "\n" + css + "\n" + read("README.md");

test("the pop-up inserts only the official current loader", () => {
  assert.equal(/<script[^>]+cdn\.sendfox\.com/i.test(html), false);
  assert.match(js, /var FORM_ID = "1xvkdn"/);
  assert.match(js, /var LOADER_SRC = "https:\/\/cdn\.sendfox\.com\/js\/embed\.js"/);
  assert.match(js, /var API_ORIGIN = "https:\/\/sendfox\.com"/);
  assert.match(js, /script\.setAttribute\("data-form", FORM_ID\)/);
  assert.match(js, /script\.setAttribute\("data-api", API_ORIGIN\)/);
  assert.match(js, /function startEmbed\(/);
  assert.match(js, /startEmbed\(\)/);
  assert.equal(js.includes("sendfox.com/js/form.js"), false);
  assert.equal(js.includes("fetch("), false);
  assert.equal(js.includes("XMLHttpRequest"), false);
  assert.equal(js.includes("innerHTML"), false);
});

test("lease and healthcare forms are not the live form", () => {
  ["261674", "1vd796", "586227", "232839", "549074"].forEach((id) => {
    assert.equal(js.includes(id), false, id);
    assert.equal(html.includes('data-form="' + id + '"'), false, id);
  });
  assert.equal(html.includes("https://sendfox.com/form/"), false);
  assert.equal(js.includes("https://sendfox.com/form/"), false);
});

test("the page has no secrets, private guide, or backend", () => {
  [
    "1508Lh4WrwEcHKeFOx0RFm_cOSwbiHEgh",
    "googleapis.com/auth",
    "refresh_token",
    "client_secret",
    "BEGIN PRIVATE",
    "AKIA",
    "api_key",
    "AIza",
    "/v1/signups",
    "render.com"
  ].forEach((needle) => {
    assert.equal(pages.includes(needle), false, needle);
  });
  assert.equal(fs.existsSync(path.join(root, "server")), false);
  assert.equal(fs.existsSync(path.join(root, "package-lock.json")), false);
  const driveUrls = pages.match(/https:\/\/drive\.google\.com[^"'\s)]*/g) || [];
  driveUrls.forEach((url) => {
    assert.match(url, /10TYZ6g7IpG6RYvpz2dKq9E43R8jqxzWb/);
  });
});

test("copy does not treat a form response as guide delivery", () => {
  assert.match(html, /The download appears here after SendFox accepts the signup/);
  assert.match(html, /Confirming your email is not required for this download/);
  assert.match(html, /does not claim that message has already arrived/);
  assert.match(html, /Invisible reCAPTCHA stays on/);
  assert.match(html, /Google invisible reCAPTCHA/);
  assert.match(html, /Poppins font from Google Fonts/);
  assert.match(html, /No deletion contact is published/);
  assert.match(html, /id="guide-ready" hidden/);
  assert.match(html, /id="guide-download" href="https:\/\/drive\.google\.com\/uc\?export=download&amp;id=10TYZ6g7IpG6RYvpz2dKq9E43R8jqxzWb"/);
  assert.match(html, /10TYZ6g7IpG6RYvpz2dKq9E43R8jqxzWb\/view\?usp=drivesdk/);
  assert.equal(html.includes("download="), false);
  assert.equal(html.includes("90 days"), false);
  assert.equal(html.includes("1508Lh4WrwEcHKeFOx0RFm_cOSwbiHEgh"), false);
  assert.equal(js.includes("innerHTML"), false);
  assert.equal(html.includes("to get the guide"), false);
  assert.equal(html.includes("data-recaptcha=\"false\""), false);
  assert.equal(js.includes("3103777"), false);
  assert.equal(html.includes("3103777"), false);
  assert.equal(read("README.md").includes("3103777"), false);
  assert.equal(html.includes("Full privacy details will be linked"), false);
  assert.match(css, /guide-ready\[hidden\]/);
  assert.match(css, /\.guide-ready \.btn/);
  assert.match(html, /Get the free Customer Recovery guide\./);
  assert.match(html, /Generator service shop owners: find overlooked follow-up work in your CRM\./);
  assert.match(css, /#6D00FF/);
  assert.match(css, /#0D0D12/);
  assert.match(css, /prefers-reduced-motion/);
});
