"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fox = require("../js/sendfox.js");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const PAGES = ["index.html", "thank-you.html", "privacy.html", "js/config.js", "js/main.js", "js/sendfox.js", "css/styles.css"];

test("shipped config keeps SendFox capture disabled", () => {
  const config = read("js/config.js");
  assert.match(config, /OFFER_REVIEWED:\s*false/);
  assert.match(config, /FORM_ID:\s*""/);
  assert.match(config, /PUBLIC_ID:\s*""/);
  const verdict = fox.assess({ OFFER_REVIEWED: false, FORM_ID: "", PUBLIC_ID: "" });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.requestsProvider, false);
  assert.equal(fox.legacyMarkup(verdict), "");
});

test("a reviewed fixture renders the documented SendFox legacy form", () => {
  const verdict = fox.assess({
    OFFER_REVIEWED: true,
    FORM_ID: "crmguideform1",
    PUBLIC_ID: "publicfixture1"
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "https://sendfox.com/form/crmguideform1/publicfixture1");
  assert.equal(verdict.scriptSrc, "https://sendfox.com/js/form.js");
  const html = fox.legacyMarkup(verdict);
  assert.match(html, /method="post"/);
  assert.match(html, /class="sendfox-form"/);
  assert.match(html, /name="email"/);
  assert.match(html, /name="a_password"/);
  assert.match(html, /src="https:\/\/sendfox\.com\/js\/form\.js"/);
  assert.equal(html.includes("api.sendfox.com"), false);
});

test("invalid origin, protocol, and known wrong ids are rejected", () => {
  const valid = { OFFER_REVIEWED: true, FORM_ID: "crmguideform1", PUBLIC_ID: "publicfixture1" };
  assert.equal(fox.assess({ OFFER_REVIEWED: true, FORM_ID: "http://evil", PUBLIC_ID: "publicfixture1" }).ok, false);
  assert.equal(fox.assess({ OFFER_REVIEWED: true, FORM_ID: "crmguideform1", PUBLIC_ID: "../etc" }).ok, false);
  assert.equal(fox.assess(Object.assign({}, valid, { ACTION: "http://sendfox.com/form/crmguideform1/publicfixture1" })).ok, false);
  assert.equal(fox.assess(Object.assign({}, valid, { ACTION: "https://evil.example/form/crmguideform1/publicfixture1" })).ok, false);
  assert.equal(fox.assess(Object.assign({}, valid, { ACTION: "https://sendfox.com/form/crmguideform1/publicfixture1?x=1" })).ok, false);
  ["261674", "1vd796", "586227", "232839", "549074"].forEach((blocked) => {
    assert.equal(fox.assess({ OFFER_REVIEWED: true, FORM_ID: blocked, PUBLIC_ID: "publicfixture1" }).ok, false);
    assert.equal(fox.assess({ OFFER_REVIEWED: true, FORM_ID: "crmguideform1", PUBLIC_ID: blocked }).ok, false);
  });
  const shipped = read("index.html") + read("js/config.js") + read("js/main.js");
  assert.equal(shipped.includes("https://sendfox.com/js/form.js"), false);
  assert.equal(shipped.includes("https://sendfox.com/form/"), false);
});

test("pages do not carry secrets, the private guide, or the old backend", () => {
  const blob = PAGES.map(read).join("\n");
  [
    "1508Lh4WrwEcHKeFOx0RFm_cOSwbiHEgh",
    "drive.google.com",
    "googleapis.com/auth",
    "GOOGLE_OAUTH",
    "refresh_token",
    "client_secret",
    "/v1/signups",
    "/v1/guide",
    "CAPTURE_API_BASE",
    "render.com",
    "api.sendfox.com"
  ].forEach((needle) => {
    assert.equal(blob.includes(needle), false, needle);
  });
  assert.equal(fs.existsSync(path.join(root, "server")), false);
});

test("landing copy, accessibility, and relative paths stay intact", () => {
  const html = read("index.html");
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /Generator service shop owners: find overlooked follow-up work in your CRM\./);
  assert.ok(html.split("Get the free Customer Recovery guide.").length - 1 >= 3);
  assert.match(html, /Identify records to review/);
  assert.match(html, /Use the scripts/);
  assert.match(html, /Track follow-up/);
  assert.match(html, /Roger Navarrette/);
  assert.match(html, /<label for="work-email">Work email<\/label>/);
  assert.match(html, /aria-describedby="email-error form-notice"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /href="css\/styles\.css"/);
  assert.match(html, /href="privacy\.html"/);
  assert.match(html, /href="thank-you\.html"/);
  assert.equal(html.includes('href="/'), false);
  assert.match(read("css/styles.css"), /#F7F6F3/);
  assert.match(read("css/styles.css"), /#1F4B3A/);
  assert.match(read("css/styles.css"), /min-height:\s*44px/);
});

test("thank-you and privacy do not claim delivery or a sheet download", () => {
  const thanks = read("thank-you.html");
  const privacy = read("privacy.html");
  assert.match(thanks, /does not confirm that an email was sent/);
  assert.match(thanks, /does not say a PDF was attached/);
  assert.match(thanks, /Want help putting this into practice\? Choose guided setup or done-for-you implementation\./);
  assert.equal(thanks.includes("Your Customer Recovery guide is ready"), false);
  assert.equal(thanks.includes("Google Sheet"), false);
  assert.match(privacy, /does not send your address to SendFox/);
  assert.match(privacy, /A public delivery link is not configured/);
  assert.match(privacy, /A deletion contact is not published/);
  assert.equal(privacy.includes("@"), false);
  assert.equal(fox.isValidEmail(""), false);
  assert.equal(fox.isValidEmail("not-an-email"), false);
  assert.equal(fox.isValidEmail("you@yourshop.com"), true);
  assert.equal(fox.NOT_READY.includes("Nothing was sent"), true);
});

test("main.js does not invent a local success redirect", () => {
  const main = read("js/main.js");
  assert.match(main, /preventDefault/);
  assert.match(main, /NOT_READY/);
  assert.equal(main.includes("thank-you.html"), false);
  assert.equal(main.includes("localStorage"), false);
  assert.equal(main.includes("sessionStorage"), false);
  assert.equal(main.includes("emailed you"), false);
});
