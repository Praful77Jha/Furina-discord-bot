// Minimal on-disk JSON persistence — no database needed for this scale of data.
// Two files: data/claimedCodes.json, data/reminderChecklist.json
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(filename, fallback) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`dataStore: failed to read ${filename}:`, err.message);
    return fallback;
  }
}

function writeJSON(filename, data) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error(`dataStore: failed to write ${filename}:`, err.message);
    return false;
  }
}

module.exports = { readJSON, writeJSON };
