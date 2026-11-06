"use strict";

const fs = require("fs");
const path = require("path");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class MemoryIdempotencyStore {
  constructor() {
    this.records = new Map();
  }

  async get(key) {
    const found = this.records.get(key);
    return found ? clone(found) : null;
  }

  async set(key, value) {
    this.records.set(key, clone(value));
  }
}

class FileIdempotencyStore {
  constructor(filePath, now) {
    this.filePath = filePath;
    this.now = now || Date.now;
    this.chain = Promise.resolve();
  }

  _enqueue(fn) {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async get(key) {
    return this._enqueue(async () => {
      const data = await readStore(this.filePath);
      return data.records[key] ? clone(data.records[key]) : null;
    });
  }

  async set(key, value) {
    return this._enqueue(async () => {
      const data = await readStore(this.filePath);
      const cutoff = this.now() - 48 * 60 * 60 * 1000;
      Object.keys(data.records).forEach((existing) => {
        const storedAt = data.records[existing] && data.records[existing].storedAtMs;
        if (typeof storedAt === "number" && storedAt < cutoff) delete data.records[existing];
      });
      data.records[key] = clone(value);
      await writeStore(this.filePath, data);
    });
  }
}

async function readStore(filePath) {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    if (!parsed || typeof parsed.records !== "object" || !parsed.records) return { records: {} };
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return { records: {} };
    throw err;
  }
}

async function writeStore(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  await fs.promises.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await fs.promises.rename(tmp, filePath);
}

async function openIdempotencyStore(config, log) {
  if (config.idempotencyMode === "memory") return new MemoryIdempotencyStore();
  try {
    await fs.promises.mkdir(path.dirname(config.idempotencyPath), { recursive: true });
    const probe = path.join(path.dirname(config.idempotencyPath), ".write-probe");
    await fs.promises.writeFile(probe, "ok", { mode: 0o600 });
    await fs.promises.unlink(probe);
    return new FileIdempotencyStore(config.idempotencyPath);
  } catch (err) {
    if (log) log({ idempotency: "memory", reason: "data_dir_unwritable" });
    return new MemoryIdempotencyStore();
  }
}

module.exports = {
  MemoryIdempotencyStore,
  FileIdempotencyStore,
  openIdempotencyStore,
};
