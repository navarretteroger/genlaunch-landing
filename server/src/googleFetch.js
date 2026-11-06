"use strict";

const DEFAULT_HEADER_TIMEOUT_MS = 8000;
const DEFAULT_BODY_IDLE_MS = 20000;

function defaultTimers() {
  return {
    set(fn, ms) {
      return setTimeout(fn, ms);
    },
    clear(handle) {
      clearTimeout(handle);
    },
  };
}

function combineSignals(signals) {
  const list = signals.filter(Boolean);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(list);
  const controller = new AbortController();
  for (const signal of list) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/**
 * Abort only if response headers do not arrive in time.
 * The timer is cleared when headers arrive and is not a cap on the body.
 */
async function fetchUntilHeaders(fetchImpl, url, init, options) {
  const settings = options || {};
  const timers = settings.timers || defaultTimers();
  const headerTimeoutMs = settings.headerTimeoutMs || DEFAULT_HEADER_TIMEOUT_MS;
  const headerAbort = new AbortController();
  let timedOut = false;
  const timer = timers.set(() => {
    timedOut = true;
    headerAbort.abort();
  }, headerTimeoutMs);
  const signal = combineSignals([headerAbort.signal, init && init.signal, settings.signal]);
  try {
    return await fetchImpl(url, Object.assign({}, init || {}, { signal, redirect: "manual" }));
  } catch (err) {
    if (timedOut) {
      const timeoutErr = new Error("header_timeout");
      timeoutErr.code = "header_timeout";
      throw timeoutErr;
    }
    throw err;
  } finally {
    timers.clear(timer);
  }
}

/**
 * After headers, abort only when no further bytes arrive within idleMs,
 * or when the caller signal aborts. There is no total transfer deadline.
 */
function streamWithIdleTimeout(source, options) {
  const settings = options || {};
  const timers = settings.timers || defaultTimers();
  const idleMs = settings.idleMs || DEFAULT_BODY_IDLE_MS;
  const reader = source.getReader();
  let mode = "open";
  let idleTimer = null;
  let streamController = null;
  const pendingError = [];

  function clearIdle() {
    if (idleTimer) {
      timers.clear(idleTimer);
      idleTimer = null;
    }
  }

  function fail(code) {
    if (mode !== "open") return;
    mode = code;
    clearIdle();
    reader.cancel().catch(() => undefined);
    const err = new Error(code);
    err.code = code;
    if (streamController) streamController.error(err);
    else pendingError.push(err);
  }

  function arm() {
    clearIdle();
    idleTimer = timers.set(() => fail("body_idle_timeout"), idleMs);
  }

  if (settings.signal) {
    if (settings.signal.aborted) fail("client_aborted");
    else {
      settings.signal.addEventListener("abort", () => fail("client_aborted"), { once: true });
    }
  }

  if (mode === "open") arm();

  return new ReadableStream({
    start(controller) {
      streamController = controller;
      if (pendingError.length) controller.error(pendingError[0]);
    },
    async pull(controller) {
      if (mode !== "open") return;
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        clearIdle();
        if (mode === "open") {
          mode = "error";
          controller.error(err);
        }
        return;
      }
      if (mode !== "open") return;
      if (chunk.done) {
        clearIdle();
        mode = "done";
        controller.close();
        return;
      }
      arm();
      controller.enqueue(chunk.value);
    },
    cancel(reason) {
      clearIdle();
      mode = "cancelled";
      return reader.cancel(reason);
    },
  });
}

function googleFetch(fetchImpl, url, init, timeoutMs) {
  return fetchUntilHeaders(fetchImpl, url, init, { headerTimeoutMs: timeoutMs || DEFAULT_HEADER_TIMEOUT_MS });
}

module.exports = {
  DEFAULT_HEADER_TIMEOUT_MS,
  DEFAULT_BODY_IDLE_MS,
  fetchUntilHeaders,
  streamWithIdleTimeout,
  googleFetch,
};
