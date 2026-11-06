"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const SIMPLE_EDITION_ID = "10TYZ6g7IpG6RYvpz2dKq9E43R8jqxzWb";
const CANONICAL_PDF_ID = "1508Lh4WrwEcHKeFOx0RFm_cOSwbiHEgh";

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const FRONTEND = [
  "index.html",
  "thank-you.html",
  "privacy.html",
  "css/styles.css",
  "js/config.js",
  "js/main.js",
  "js/thank-you.js",
  "js/validators.js",
];

test("landing copy matches the build spec", () => {
  const html = read("index.html");
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /Generator service shop owners: find overlooked follow-up work in your CRM\./);
  const cta = "Get the free Customer Recovery guide.";
  assert.ok(html.split(cta).length - 1 >= 3);
  assert.match(html, /Identify records to review/);
  assert.match(html, /Use the scripts/);
  assert.match(html, /Track follow-up/);
  assert.match(html, /Roger Navarrette/);
  assert.match(html, /about 1–3 locations/);
  assert.match(html, /under about 100 staff/);
  assert.match(html, /service-only/i);
  assert.match(html, /Enter your work email to continue\.|form-helper-preview/);
  assert.match(html, /Preview mode — no capture, no download/);
  assert.match(html, /Preview mode: this form does not store your email and does not provide a real PDF download\./);
  assert.match(html, /data-delivery-mode="preview"/);
  assert.match(html, /<label for="work-email">Work email<\/label>/);
  assert.match(html, /aria-describedby="email-error form-notice"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /href="css\/styles\.css"/);
  assert.equal(html.includes('href="/css'), false);
  assert.equal((html.match(/type="email"/g) || []).length, 1);
  assert.equal(html.includes('type="tel"'), false);
  assert.equal(html.includes("<base"), false);
});

test("privacy notice states collection, purpose, non-consent, and retention without a fake contact", () => {
  for (const file of ["index.html", "privacy.html"]) {
    const html = read(file);
    assert.match(html, /When production capture is on, the server stores the email address you submit\./);
    assert.match(html, /The purpose of storing the email is guide access\./);
    assert.match(html, /marketing_opt_in is stored as false\./);
    assert.match(html, /That false value is not consent to messages\./);
    assert.match(html, /Outbound sending is off\./);
    assert.match(html, /This system does not send email and does not track email opens\./);
    assert.match(html, /Saving an email address does not prove you control that inbox\./);
    assert.match(html, /The check in the browser is only a format check\./);
    assert.match(html, /A download token works for anyone who has it until it expires\./);
    assert.match(html, /It is not a link to the private Drive file\./);
    assert.match(html, /The signup sheet is separate from campaign prospect lists\./);
    assert.match(html, /No automatic deletion period is configured\./);
    assert.match(html, /This is not a retention guarantee or a certification\./);
    assert.match(html, /A verified deletion contact is not published on this page\./);
    assert.match(html, /No tracking pixels are on this page\./);
    assert.equal(html.includes("five business days"), false);
    assert.equal(html.includes("Handoff"), false);
    assert.equal(html.includes("optional one follow-up"), false);
    assert.equal(html.includes("@gmail.com"), false);
  }
});

test("thank-you keeps preview success separate and has no price or checkout", () => {
  const html = read("thank-you.html");
  assert.match(html, /Preview complete — delivery not enabled yet/);
  assert.match(html, /do <strong>not<\/strong> collect your email/);
  assert.match(html, /id="production-thank-you"[^>]*hidden/);
  assert.match(html, /Your Customer Recovery guide is ready/);
  assert.match(html, /Download the guide now and save a copy for your shop\. This page does <strong>not<\/strong> email the PDF\./);
  assert.match(html, /Download the Customer Recovery guide \(PDF\)/);
  assert.match(html, /Want help putting this into practice\? Choose guided setup or done-for-you implementation\./);
  assert.match(html, /This form does not sign you up for a paid service\./);
  assert.match(html, /no “Buy now,”/);
  assert.equal(html.includes("$"), false);
  assert.equal(html.includes("1497"), false);
  assert.equal(html.includes("stripe"), false);
  assert.equal(html.includes("skool"), false);
  assert.equal(html.includes("Handoff"), false);
  assert.equal(html.includes("already on the signup sheet"), false);
  assert.equal(html.includes('href="http'), false);
  assert.equal(html.includes("<form"), false);
});

test("static frontend has no backend credentials, Drive URL, or private file id", () => {
  const banned = [
    CANONICAL_PDF_ID,
    SIMPLE_EDITION_ID,
    "drive.google.com",
    "client_secret",
    "refresh_token",
    "GOOGLE_OAUTH",
    "GRANT_SIGNING",
    "googletagmanager",
    "facebook.net",
    "doubleclick",
    "1RXBQl4KQU-FUOLBmL6iXjy3mcaIzw8Xl5n5vVtcbRVw",
  ];
  FRONTEND.forEach((file) => {
    const text = read(file);
    banned.forEach((needle) => {
      assert.equal(text.includes(needle), false, file + " contains " + needle);
    });
  });
  const config = read("js/config.js");
  assert.match(config, /DELIVERY_MODE:\s*"preview"/);
  assert.match(config, /CAPTURE_API_BASE:\s*null/);
  const main = read("js/main.js");
  assert.match(main, /credentials:\s*"omit"/);
  assert.match(main, /Idempotency-Key/);
  assert.match(main, /preventDefault/);
  assert.match(main, /textContent/);
  assert.equal(main.includes("innerHTML"), false);
  const thanks = read("js/thank-you.js");
  assert.match(thanks, /Authorization/);
  assert.match(thanks, /Bearer /);
  assert.equal(thanks.includes("?grant"), false);
  assert.equal(thanks.includes("drive.google.com"), false);
  const css = read("css/styles.css");
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});

test("repo ships no PDF and the server does not share Drive or send mail", () => {
  function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (entry.name === ".git" || entry.name === "node_modules") return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else assert.equal(/\.pdf$/i.test(entry.name), false, full);
    });
  }
  walk(root);
  const drive = read("server/src/drive.js");
  assert.match(drive, /alt=media/);
  assert.equal(drive.includes("/permissions"), false);
  assert.equal(drive.includes("webContentLink"), false);
  const tree = ["server/src", "js", "index.html", "thank-you.html", "privacy.html"]
    .map((rel) => {
      const full = path.join(root, rel);
      if (fs.statSync(full).isDirectory()) {
        return fs.readdirSync(full).map((name) => read(path.join(rel, name))).join("\n");
      }
      return read(rel);
    })
    .join("\n");
  ["nodemailer", "mail.google.com", "sk_live", "api.stripe.com", "skool.com", "BEGIN PRIVATE KEY"].forEach((needle) => {
    assert.equal(tree.includes(needle), false, needle);
  });
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies, undefined);
  const workflow = read(".github/workflows/test.yml");
  assert.equal(workflow.includes("peaceiris/actions-gh-pages"), false);
  assert.equal(workflow.includes("JamesIves/github-pages-deploy"), false);
});
