"use strict";

const { loadConfig, captureConfigured, missingSecretNames, assertRuntimeConfig, deletionContactConfigured } = require("./config");
const { createApp } = require("./app");
const { openIdempotencyStore } = require("./idempotency");
const { followUpPolicy } = require("./followUpPolicy");

async function main() {
  const config = loadConfig();
  const log = (entry) => console.log(JSON.stringify(entry));
  assertRuntimeConfig(config);
  if (config.ignoredApplicationCredentials) {
    log({
      warning:
        "GOOGLE_APPLICATION_CREDENTIALS is set and ignored. This server uses the owner OAuth refresh token only.",
    });
  }
  const store = await openIdempotencyStore(config);
  const server = createApp({ config, store, log });
  server.listen(config.port, config.host, () => {
    log({
      msg: "listening",
      port: config.port,
      configPresent: missingSecretNames(config).length === 0,
      deletionContactConfigured: deletionContactConfigured(config),
      captureConfigured: captureConfigured(config) && store.durable === true,
      missing: missingSecretNames(config),
      outboundSending: followUpPolicy.outboundSending,
      followUp: followUpPolicy.status,
      authorizationMode: "owner-oauth",
      idempotency: store.durable ? "file" : "memory",
      googleAuth: "unknown",
      sheets: "unknown",
    });
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.log(JSON.stringify({ level: "error", code: err && err.code ? err.code : "startup_failed" }));
    process.exit(1);
  });
}

module.exports = { main };
