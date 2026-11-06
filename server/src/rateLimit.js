"use strict";

function createRateLimiter(options) {
  const signupPerMinute = options.signupPerMinute;
  const downloadPerMinute = options.downloadPerMinute;
  const now = options.now || Date.now;
  const hits = new Map();

  function allow(bucket, limit) {
    const t = now();
    const windowMs = 60000;
    const recent = (hits.get(bucket) || []).filter((ts) => t - ts < windowMs);
    if (recent.length >= limit) {
      hits.set(bucket, recent);
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000));
      return { ok: false, retryAfterSeconds };
    }
    recent.push(t);
    hits.set(bucket, recent);
    return { ok: true };
  }

  return {
    signup(ip) {
      return allow("signup:" + ip, signupPerMinute);
    },
    download(ip) {
      return allow("download:" + ip, downloadPerMinute);
    },
  };
}

function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers && req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return forwarded.split(",")[0].trim().slice(0, 80);
    }
  }
  if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
  return "unknown";
}

module.exports = { createRateLimiter, clientIp };
