const { google } = require('googleapis');
const path = require('path');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, '../credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });
const HISTORY_SHEET_NAME = '_History';

async function getSheetTitle() {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SPREADSHEET_ID
  });
  return spreadsheet.data.sheets[0].properties.title;
}

async function getLastDataRow() {
  const sheetTitle = await getSheetTitle();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'${sheetTitle}'!A:A`
  });
  const rows = res.data.values || [];
  return rows.length; // last row number that has data (row 1 = header)
}

function detectTaskDetails(url, customAmount) {
  let taskType = 'Comment (Twitter/X)';
  let defaultAmount = 0.15;
  const link = url.toLowerCase();

  if (link.includes('twitter.com') || link.includes('x.com')) {
    taskType = 'Comment (Twitter/X)';
    defaultAmount = 0.15;
  } else if (link.includes('linkedin.com')) {
    taskType = 'Comment(Linkedin)';
    defaultAmount = 0.15;
  } else if (link.includes('medium.com')) {
    taskType = 'Comment (Medium)';
    defaultAmount = 0.15;
  } else if (link.includes('youtube.com') || link.includes('youtu.be')) {
    taskType = 'Comment (Youtube)';
    defaultAmount = 0.15;
  } else if (link.includes('reddit.com')) {
    taskType = 'Comment (Reddit)';
    defaultAmount = 0.30;
  }

  const finalAmount = customAmount ? parseFloat(customAmount) : defaultAmount;
  return { taskType, amount: finalAmount };
}

// ---------- History / Undo system ----------
// Every write-command logs {timestamp, user, command, range, oldValues, newValues}
// to a hidden "_History" tab in the same spreadsheet. This survives bot restarts
// (unlike an in-memory backup), and lets /undo reverse ANY logged change, not just
// the last appended row.

async function ensureHistorySheet() {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SPREADSHEET_ID
  });
  const exists = spreadsheet.data.sheets.some(
    s => s.properties.title === HISTORY_SHEET_NAME
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: HISTORY_SHEET_NAME, hidden: true }
          }
        }]
      }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${HISTORY_SHEET_NAME}'!A1:F1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Timestamp', 'User', 'Command', 'Range', 'OldValues', 'NewValues']]
      }
    });
  }
}

async function logHistory({ user, command, range, oldValues, newValues }) {
  await ensureHistorySheet();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'${HISTORY_SHEET_NAME}'!A:F`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        new Date().toISOString(),
        user,
        command,
        range,
        JSON.stringify(oldValues || []),
        JSON.stringify(newValues || [])
      ]]
    }
  });
}

// Finds the most recent (non-cleared) history entry, optionally filtered to a
// specific command name (e.g. only 'sadashiv pralaya' entries).
async function findLastHistoryEntry(commandFilter) {
  await ensureHistorySheet();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'${HISTORY_SHEET_NAME}'!A2:F`
  });
  const rows = res.data.values || [];

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || row.length === 0) continue; // skip already-undone (cleared) entries
    const command = row[2];
    if (!commandFilter || command === commandFilter) {
      return { rowIndex: i + 2, entry: row }; // +2: row 1 is header, arrays are 0-indexed
    }
  }
  return null;
}

async function removeHistoryEntry(rowIndex) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'${HISTORY_SHEET_NAME}'!A${rowIndex}:F${rowIndex}`
  });
}

module.exports = {
  sheets,
  getSheetTitle,
  getLastDataRow,
  detectTaskDetails,
  logHistory,
  findLastHistoryEntry,
  removeHistoryEntry
};
