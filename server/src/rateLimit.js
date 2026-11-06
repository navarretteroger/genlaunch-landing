"use strict";

function normalizeIp(ip) {
  if (!ip) return "";
  let value = String(ip).trim().toLowerCase();
  if (value.startsWith("::ffff:")) value = value.slice(7);
  return value;
}

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (let i = 0; i < 4; i += 1) {
    if (!/^\d{1,3}$/.test(parts[i])) return null;
    const octet = Number(parts[i]);
    if (octet > 255) return null;
    result = (result * 256) + octet;
  }
  return result >>> 0;
}

function ipMatches(ip, rule) {
  const normalized = normalizeIp(ip);
  const candidate = String(rule || "").trim().toLowerCase();
  if (!candidate) return false;
  if (!candidate.includes("/")) return normalizeIp(candidate) === normalized;
  const bits = Number(candidate.slice(candidate.indexOf("/") + 1));
  const base = candidate.slice(0, candidate.indexOf("/"));
  const ipInt = ipv4ToInt(normalized);
  const baseInt = ipv4ToInt(base);
  if (ipInt == null || baseInt == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0);
  return (ipInt & mask) === (baseInt & mask);
}

function ipInTrustedSet(ip, cidrs) {
  return (cidrs || []).some((rule) => ipMatches(ip, rule));
}

/**
 * X-Forwarded-For is used only when the immediate peer is in trustedProxyCidrs.
 * Walk from the right and skip addresses that are themselves trusted hops.
 * If the header is missing, malformed, or only trusted hops, return the socket
 * address. Do not use the leftmost value.
 */
function clientIp(req, config) {
  const settings = config || {};
  const socketIp = normalizeIp(req.socket && req.socket.remoteAddress) || "unknown";
  const cidrs = settings.trustedProxyCidrs || [];
  const peerTrusted = settings.trustProxy === true && cidrs.length > 0 && ipInTrustedSet(socketIp, cidrs);
  if (!peerTrusted) return socketIp;
  const header = req.headers && req.headers["x-forwarded-for"];
  if (typeof header !== "string" || !header.trim() || header.length > 1000) return socketIp;
  const chain = header.split(",").map((item) => normalizeIp(item)).filter(Boolean);
  if (chain.length === 0 || chain.length > 20) return socketIp;
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    if (!ipInTrustedSet(chain[i], cidrs)) return chain[i];
  }
  return socketIp;
}

function createRateLimiter(options) {
  const signupPerMinute = options.signupPerMinute;
  const downloadPerMinute = options.downloadPerMinute;
  const globalSignupPerHour = options.globalSignupPerHour;
  const globalDownloadPerHour = options.globalDownloadPerHour;
  const maxKeys = options.maxKeys || 5000;
  const now = options.now || Date.now;
  const hits = new Map();

  function prune(t) {
    for (const [key, stamps] of hits) {
      const windowMs = key.indexOf("global:") === 0 ? 3600000 : 60000;
      const recent = stamps.filter((ts) => t - ts < windowMs);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      hits.delete(oldest);
    }
  }

  function allow(bucket, limit, windowMs) {
    const t = now();
    prune(t);
    if (!hits.has(bucket) && hits.size >= maxKeys) {
      return { ok: false, retryAfterSeconds: 60 };
    }
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

  let inFlight = 0;
  const maxInFlight = options.maxInFlight || 4;

  function acquire() {
    if (inFlight >= maxInFlight) return { ok: false, retryAfterSeconds: 2 };
    inFlight += 1;
    let released = false;
    return {
      ok: true,
      release() {
        if (released) return;
        released = true;
        inFlight -= 1;
      },
    };
  }

  function prepare(charge) {
    const slot = acquire();
    if (!slot.ok) return slot;
    const quota = charge();
    if (!quota.ok) {
      slot.release();
      return quota;
    }
    return { ok: true, release: slot.release };
  }

  return {
    signupRequest(ip) {
      return allow("signup-request:" + ip, signupPerMinute, 60000);
    },
    downloadRequest(ip) {
      return allow("download-request:" + ip, downloadPerMinute, 60000);
    },
    chargeSignupUpstream() {
      return allow("global:signup", globalSignupPerHour, 3600000);
    },
    chargeDownloadUpstream() {
      return allow("global:download", globalDownloadPerHour, 3600000);
    },
    prepareSignupUpstream() {
      return prepare(() => allow("global:signup", globalSignupPerHour, 3600000));
    },
    prepareDownloadUpstream() {
      return prepare(() => allow("global:download", globalDownloadPerHour, 3600000));
    },
  };
}

module.exports = {
  normalizeIp,
  ipMatches,
  clientIp,
  createRateLimiter,
};
