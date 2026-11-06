"use strict";

const { CodedError } = require("./errors");

class KeyLock {
  constructor(options) {
    const settings = options || {};
    this.tails = new Map();
    this.maxKeys = settings.maxKeys || 2000;
    this.idleMs = settings.idleMs || 120000;
    this.now = settings.now || Date.now;
  }

  prune() {
    const t = this.now();
    for (const [key, slot] of this.tails) {
      if (slot.settled && t - slot.last > this.idleMs) this.tails.delete(key);
    }
  }

  run(key, fn) {
    this.prune();
    if (!this.tails.has(key) && this.tails.size >= this.maxKeys) {
      return Promise.reject(new CodedError("lock_capacity"));
    }
    const prev = this.tails.get(key);
    const run = (prev ? prev.promise : Promise.resolve()).then(fn);
    const slot = { promise: null, settled: false, last: this.now() };
    slot.promise = run.then(
      () => {
        slot.settled = true;
        slot.last = this.now();
      },
      () => {
        slot.settled = true;
        slot.last = this.now();
      }
    );
    this.tails.set(key, slot);
    return run;
  }
}

module.exports = { KeyLock };
