"use strict";

const SENSITIVE_QUERY = /^(grant|token|downloadtoken|download_token|access_token|refresh_token|id_token|code|email|client_secret|authorization)$/i;

function requestPathname(urlString) {
  try {
    return new URL(urlString, "http://127.0.0.1").pathname || "/";
  } catch (err) {
    return "/";
  }
}

function hasSensitiveQuery(urlString) {
  let url;
  try {
    url = new URL(urlString, "http://127.0.0.1");
  } catch (err) {
    return false;
  }
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY.test(key)) return true;
  }
  return false;
}

function summarizeRequest(req, status) {
  return {
    method: req && req.method ? req.method : "",
    path: requestPathname(req && req.url ? req.url : "/"),
    status: status,
  };
}

module.exports = {
  hasSensitiveQuery,
  requestPathname,
  summarizeRequest,
};
