"use strict";

class KeyLock {
  constructor() {
    this.tails = new Map();
  }

  run(key, fn) {
    const prev = this.tails.get(key) || Promise.resolve();
    const run = prev.then(fn, fn);
    this.tails.set(
      key,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }
}

module.exports = { KeyLock };
