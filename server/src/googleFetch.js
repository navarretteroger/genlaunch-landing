"use strict";

const DEFAULT_TIMEOUT_MS = 8000;

function googleFetch(fetchImpl, url, init, timeoutMs) {
  const ms = timeoutMs || DEFAULT_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(ms);
  const parent = init && init.signal;
  const signal = parent && typeof AbortSignal.any === "function" ? AbortSignal.any([parent, timeout]) : timeout;
  return fetchImpl(url, Object.assign({}, init || {}, { signal, redirect: "manual" }));
}

module.exports = { googleFetch, DEFAULT_TIMEOUT_MS };
