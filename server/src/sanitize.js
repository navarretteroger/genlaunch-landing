"use strict";

/** Cells that Sheets or Excel may treat as formulas if a future write uses USER_ENTERED. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function sanitizeCell(value) {
  const text = value == null ? "" : String(value);
  if (FORMULA_PREFIX.test(text)) return "'" + text;
  return text;
}

module.exports = { sanitizeCell, FORMULA_PREFIX };
