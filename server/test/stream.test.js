"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fetchUntilHeaders, streamWithIdleTimeout } = require("../src/googleFetch");

function manualTimers() {
  const handles = [];
  return {
    handles,
    set(fn, ms) {
      const handle = { fn, ms, cleared: false };
      handles.push(handle);
      return handle;
    },
    clear(handle) {
      if (handle) handle.cleared = true;
    },
    active(ms) {
      return handles.filter((handle) => handle.ms === ms && !handle.cleared);
    },
  };
}

test("header timeout aborts a hung upstream and clears its timer", async () => {
  const timers = manualTimers();
  let signal;
  const pending = fetchUntilHeaders(function (url, init) {
    signal = init.signal;
    return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
  }, "https://www.googleapis.com/drive/v3/files/example?alt=media", { method: "GET" }, {
    headerTimeoutMs: 8000,
    timers,
  });
  const headerTimer = timers.active(8000)[0];
  assert.ok(headerTimer);
  headerTimer.fn();
  await assert.rejects(pending, (err) => err.code === "header_timeout");
  assert.equal(headerTimer.cleared, true);
  assert.equal(signal.aborted, true);
});

test("pdf bytes can pass the old 8 second deadline and a hung body trips the idle timeout", async () => {
  const timers = manualTimers();
  let pull;
  const source = new ReadableStream({
    pull(controller) {
      return new Promise((resolve) => {
        pull = { controller, resolve };
      });
    },
  });
  const output = streamWithIdleTimeout(source, { idleMs: 20000, timers });
  const reader = output.getReader();
  const firstRead = reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.active(8000).length, 0);
  assert.equal(timers.active(20000).length, 1);
  pull.controller.enqueue(new Uint8Array([37]));
  pull.resolve();
  const first = await firstRead;
  assert.equal(first.done, false);
  assert.equal(first.value[0], 37);
  const nextRead = reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  pull.controller.enqueue(new Uint8Array([80]));
  pull.resolve();
  const second = await nextRead;
  assert.equal(second.value[0], 80);
  const idle = timers.active(20000);
  assert.ok(idle.length >= 1);
  idle[idle.length - 1].fn();
  await assert.rejects(reader.read(), (err) => err.code === "body_idle_timeout");
  assert.equal(timers.handles.filter((handle) => handle.ms === 20000).every((handle) => handle.cleared), true);
});

test("client disconnect aborts the pdf body and clears the idle timer", async () => {
  const timers = manualTimers();
  const source = new ReadableStream({
    pull() {
      return new Promise(() => undefined);
    },
  });
  const abort = new AbortController();
  const output = streamWithIdleTimeout(source, { idleMs: 20000, timers, signal: abort.signal });
  const reader = output.getReader();
  const pending = reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(timers.active(20000).length >= 1);
  abort.abort();
  await assert.rejects(pending, (err) => err.code === "client_aborted");
  assert.equal(timers.handles.filter((handle) => handle.ms === 20000).every((handle) => handle.cleared), true);
});
