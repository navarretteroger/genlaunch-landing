"use strict";

const { loadConfig, captureConfigured, missingSecretNames } = require("./config");
const { createApp } = require("./app");
const { openIdempotencyStore } = require("./idempotency");
const { followUpPolicy } = require("./followUpPolicy");

async function main() {
  const config = loadConfig();
  const log = (entry) => console.log(JSON.stringify(entry));
  if (config.ignoredApplicationCredentials) {
    log({
      warning:
        "GOOGLE_APPLICATION_CREDENTIALS is set and ignored. This server uses the owner OAuth refresh token only.",
    });
  }
  const store = await openIdempotencyStore(config, log);
  const server = createApp({ config, store, log });
  server.listen(config.port, config.host, () => {
    log({
      msg: "listening",
      port: config.port,
      captureConfigured: captureConfigured(config),
      missing: missingSecretNames(config),
      outboundSending: followUpPolicy.outboundSending,
      followUp: followUpPolicy.status,
      authorizationMode: "owner-oauth",
      idempotency: config.idempotencyMode === "memory" || store.constructor.name === "MemoryIdempotencyStore"
        ? "memory"
        : "file",
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
