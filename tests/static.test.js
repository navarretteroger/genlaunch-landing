"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fox = require("../js/sendfox.js");

const root = path.resolve(__dirname, "..");
const VENDOR = '<script src="https://cdn.sendfox.com/js/embed.js" data-form="1xvkdn" data-api="https://sendfox.com" async></script>';
const HOSTED = "https://sendfox.com/form/mnn70x/1xvkdn";

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const PAGES = ["index.html", "thank-you.html", "privacy.html", "js/main.js", "css/styles.css"];

function shippedConfig() {
  return {
    INTEGRATION_ENABLED: false,
    DELIVERY_ENABLED: false,
    PUBLIC_FORM_ID: "1xvkdn",
    LIST_ID: "684175",
    INTERNAL_FORM_ID: "298803",
    LOADER_SRC: fox.LOADER_SRC,
    API_ORIGIN: fox.API_ORIGIN
  };
}

function enabledReference() {
  const config = shippedConfig();
  config.INTEGRATION_ENABLED = true;
  config.DELIVERY_ENABLED = true;
  return config;
}

test("shipped reference stays disabled and does not mount the loader", () => {
  const config = read("js/config.js");
  assert.match(config, /INTEGRATION_ENABLED:\s*false/);
  assert.match(config, /DELIVERY_ENABLED:\s*false/);
  assert.match(config, /PUBLIC_FORM_ID:\s*"1xvkdn"/);
  assert.match(config, /LIST_ID:\s*"684175"/);
  assert.match(config, /INTERNAL_FORM_ID:\s*"298803"/);
  const verdict = fox.referenceLoader(shippedConfig());
  assert.equal(verdict.matchesVendor, false);
  assert.equal(verdict.mountVendor, false);
  assert.equal(verdict.requestsProvider, false);
  assert.equal(verdict.html, "");
  assert.equal(fox.pageBehavior().mountVendor, false);
  assert.equal(fox.pageBehavior(enabledReference()).mountVendor, false);
});

test("the exact current loader matches only as an unmounted reference", () => {
  const verdict = fox.referenceLoader(enabledReference());
  assert.equal(verdict.matchesVendor, true);
  assert.equal(verdict.mountVendor, false);
  assert.equal(verdict.requestsProvider, false);
  assert.equal(verdict.html, VENDOR);
  assert.equal(verdict.html.includes("form.js"), false);
  assert.equal(verdict.html.includes("/form/"), false);
});

test("legacy loader, hosted form, and wrong ids are rejected", () => {
  const legacy = enabledReference();
  legacy.LOADER_SRC = "https://sendfox.com/js/form.js";
  assert.equal(fox.referenceLoader(legacy).matchesVendor, false);
  assert.ok(fox.referenceLoader(legacy).reasons.includes("legacy_loader_rejected"));

  const httpLoader = enabledReference();
  httpLoader.LOADER_SRC = "http://cdn.sendfox.com/js/embed.js";
  assert.equal(fox.referenceLoader(httpLoader).matchesVendor, false);

  const badApi = enabledReference();
  badApi.API_ORIGIN = "http://sendfox.com";
  assert.equal(fox.referenceLoader(badApi).matchesVendor, false);

  const otherApi = enabledReference();
  otherApi.API_ORIGIN = "https://evil.example";
  assert.equal(fox.referenceLoader(otherApi).matchesVendor, false);

  const hosted = enabledReference();
  hosted.HOSTED_URL = HOSTED;
  assert.equal(fox.referenceLoader(hosted).matchesVendor, false);
  assert.ok(fox.referenceLoader(hosted).reasons.includes("hosted_form_rejected"));
  assert.equal(fox.isHostedForm(HOSTED), true);

  ["261674", "1vd796", "586227", "232839", "549074", "298803", "684175"].forEach((blocked) => {
    const config = enabledReference();
    config.PUBLIC_FORM_ID = blocked;
    assert.equal(fox.referenceLoader(config).matchesVendor, false, blocked);
  });
});

test("pages do not carry a vendor tag, hosted form, secrets, or the old backend", () => {
  const html = read("index.html") + read("thank-you.html") + read("privacy.html") + read("js/main.js");
  assert.equal(/<script[^>]+src=["']https?:\/\//i.test(html), false);
  assert.equal(/<iframe\b/i.test(html), false);
  assert.equal(html.includes("cdn.sendfox.com"), false);
  assert.equal(html.includes("sendfox.com/js/form.js"), false);
  assert.equal(html.includes("sendfox.com/form/"), false);
  assert.equal(html.includes("mnn70x"), false);
  assert.equal(html.includes(HOSTED), false);
  const blob = PAGES.concat(["js/config.js", "js/sendfox.js"]).map(read).join("\n");
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
  assert.equal(read("js/main.js").includes("createElement"), false);
  assert.equal(read("js/main.js").includes("fetch("), false);
});

test("landing copy, order, and accessibility stay intact", () => {
  const html = read("index.html");
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /Generator service shop owners: find overlooked follow-up work in your CRM\./);
  assert.ok(html.split("Get the free Customer Recovery guide.").length - 1 >= 3);
  assert.match(html, /Identify records to review/);
  assert.match(html, /Use the scripts/);
  assert.match(html, /Track follow-up/);
  assert.match(html, /Roger Navarrette/);
  assert.ok(html.indexOf('id="about-title"') < html.indexOf('id="get-guide"'));
  assert.ok(html.indexOf('id="get-guide"') < html.indexOf('id="privacy-title"'));
  assert.match(html, /<label for="work-email">Work email<\/label>/);
  assert.match(html, /id="work-email"[^>]*disabled/);
  assert.match(html, /aria-describedby="form-status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /type="button"/);
  assert.equal(/<form\b/i.test(html), false);
  assert.match(html, /href="css\/styles\.css"/);
  assert.match(html, /href="privacy\.html"/);
  assert.match(html, /href="thank-you\.html"/);
  assert.equal(html.includes('href="/'), false);
  assert.match(read("css/styles.css"), /#F7F6F3/);
  assert.match(read("css/styles.css"), /#1F4B3A/);
  assert.match(read("css/styles.css"), /min-height:\s*44px/);
  assert.match(read("css/styles.css"), /prefers-reduced-motion/);
});

test("thank-you and privacy do not claim delivery", () => {
  const thanks = read("thank-you.html");
  const privacy = read("privacy.html");
  const sentence = fox.NOT_READY;
  assert.match(thanks, /No information has been submitted and no email has been sent/);
  assert.match(thanks, /does not say a PDF was attached/);
  assert.match(thanks, /Want help putting this into practice\? Choose guided setup or done-for-you implementation\./);
  assert.equal(thanks.includes("Your Customer Recovery guide is ready"), false);
  assert.equal(thanks.includes("signup was successful"), false);
  assert.match(privacy, /No information has been submitted and no email has been sent/);
  assert.match(privacy, /A public delivery link is not configured/);
  assert.match(privacy, /A deletion contact is not published/);
  assert.equal(privacy.includes("@"), false);
  assert.equal(sentence, "Signup and guide delivery are not available yet. No information has been submitted and no email has been sent.");
});
