'use strict';
const fs = require('fs');
const Papa = require('papaparse');

/** Read a CSV file into an array of row objects (BOM-safe, all values kept as strings). */
function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const res = Papa.parse(text, { header: true, skipEmptyLines: 'greedy', dynamicTyping: false });
  if (res.errors.length && res.errors.some((e) => e.type === 'Delimiter' || e.type === 'Quotes')) {
    throw new Error(`CSV parse error in ${file}: ${res.errors[0].message}`);
  }
  return { headers: res.meta.fields || [], rows: res.data };
}

module.exports = { readCsv };
