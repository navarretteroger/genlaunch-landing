"use strict";

class CodedError extends Error {
  constructor(code) {
    super(code);
    this.name = "CodedError";
    this.code = code;
  }
}

module.exports = { CodedError };
