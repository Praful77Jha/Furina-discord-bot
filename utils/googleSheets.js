const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const credsPath = path.join(__dirname, '../credentials.json');
const authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };

function parseCreds(raw) {
  try {
    return JSON.parse(raw);
  } catch (firstErr) {
    const fixed = raw.trim()
      .replace(/'/g, '"')
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
    try {
      return JSON.parse(fixed);
    } catch (secondErr) {
      throw new Error(`GOOGLE_CREDENTIALS_JSON is not valid JSON (${secondErr.message}). Re-paste the service-account file as strict single-line JSON.`);
    }
  }
}

let sheets = null;
try {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    authOptions.credentials = parseCreds(process.env.GOOGLE_CREDENTIALS_JSON);
  } else if (fs.existsSync(credsPath)) {
    authOptions.keyFile = credsPath;
  } else {
    throw new Error('Missing Google credentials: set GOOGLE_CREDENTIALS_JSON env var or add credentials.json locally.');
  }

  const auth = new google.auth.GoogleAuth(authOptions);
  sheets = google.sheets({ version: 'v4', auth });
} catch (err) {
  // Never crash the whole bot over Sheets - tracking commands report it instead.
  console.error('Google Sheets disabled:', err.message);
  sheets = new Proxy({}, {
    get: () => () => { throw new Error('Google Sheets unavailable: fix GOOGLE_CREDENTIALS_JSON on the host.'); }
  });
}
const HISTORY_SHEET_NAME = '_History';

// Multi-Sheet Configuration Object
const SHEET_CONFIGS = {
  captain: {
    label: 'Captain',
    spreadsheetId: process.env.SPREADSHEET_ID,
    channelId: process.env.CAPTAIN_CHANNEL_ID,
    startRow: 2,
    lastCol: 'E',
    colLetters: {
      date: 'A',
      type: 'B',
      amount: 'C',
      pay: 'D',
      link: 'E'
    }
  },
  celebi: {
    label: 'Celebi',
    spreadsheetId: process.env.CELEBI_SPREADSHEET_ID,
    channelId: process.env.CELEBI_CHANNEL_ID,
    startRow: 11,
    lastCol: 'H',
    colLetters: {
      provider: 'A',
      date: 'B',
      link: 'C',
      account: 'D',
      type: 'E',
      credits: 'F',
      status: 'G',
      pay: 'H'
    }
  }
};

// Returns null if the command is running in the right channel for that
// sheet, or an error string to reply with if it isn't.
function checkChannel(interaction, config) {
  if (config.channelId && interaction.channelId !== config.channelId) {
    return `⚠️ **${config.label}** commands can only be used in <#${config.channelId}>.`;
  }
  return null;
}

async function getSheetTitle(spreadsheetId = process.env.SPREADSHEET_ID) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId
  });
  return spreadsheet.data.sheets[0].properties.title;
}

async function getLastDataRow(spreadsheetId = process.env.SPREADSHEET_ID, sheetTitle, startRow = 2, checkCol = 'A') {
  if (!sheetTitle) {
    sheetTitle = await getSheetTitle(spreadsheetId);
  }
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetTitle}'!${checkCol}${startRow}:${checkCol}`
  });
  const rows = res.data.values || [];
  return rows.length > 0 ? (startRow - 1) + rows.length : startRow - 1;
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

function detectCelebiTaskDetails(url) {
  let taskType = 'OTHER PLATFORM COMMENT';
  let credits = 0.2;
  const link = url.toLowerCase();

  if (link.includes('reddit.com')) {
    taskType = 'REDDIT COMMENT';
    credits = 0.5;
  }

  return { taskType, credits };
}

// ---------- History / Undo system ----------

async function ensureHistorySheet(spreadsheetId = process.env.SPREADSHEET_ID) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId
  });
  const exists = spreadsheet.data.sheets.some(
    s => s.properties.title === HISTORY_SHEET_NAME
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: HISTORY_SHEET_NAME, hidden: true }
          }
        }]
      }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${HISTORY_SHEET_NAME}'!A1:F1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Timestamp', 'User', 'Command', 'Range', 'OldValues', 'NewValues']]
      }
    });
  }
}

async function logHistory(spreadsheetId, logData) {
  // Support both legacy signature logHistory({ user, command... }) and logHistory(spreadsheetId, logData)
  let targetId = spreadsheetId;
  let data = logData;

  if (typeof spreadsheetId === 'object') {
    data = spreadsheetId;
    targetId = process.env.SPREADSHEET_ID;
  }

  const { user, command, range, oldValues, newValues } = data;

  await ensureHistorySheet(targetId);
  await sheets.spreadsheets.values.append({
    spreadsheetId: targetId,
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

async function findLastHistoryEntry(spreadsheetId, commandFilter) {
  let targetId = spreadsheetId;
  let filter = commandFilter;

  if (typeof spreadsheetId !== 'string') {
    filter = spreadsheetId;
    targetId = process.env.SPREADSHEET_ID;
  }

  await ensureHistorySheet(targetId);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: targetId,
    range: `'${HISTORY_SHEET_NAME}'!A2:F`
  });
  const rows = res.data.values || [];

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const command = row[2];
    if (!filter || command === filter) {
      return { rowIndex: i + 2, entry: row };
    }
  }
  return null;
}

async function removeHistoryEntry(spreadsheetId, rowIndex) {
  let targetId = spreadsheetId;
  let index = rowIndex;

  if (typeof spreadsheetId === 'number') {
    index = spreadsheetId;
    targetId = process.env.SPREADSHEET_ID;
  }

  await sheets.spreadsheets.values.clear({
    spreadsheetId: targetId,
    range: `'${HISTORY_SHEET_NAME}'!A${index}:F${index}`
  });
}

module.exports = {
  sheets,
  SHEET_CONFIGS,
  checkChannel,
  getSheetTitle,
  getLastDataRow,
  detectTaskDetails,
  detectCelebiTaskDetails,
  logHistory,
  findLastHistoryEntry,
  removeHistoryEntry
};