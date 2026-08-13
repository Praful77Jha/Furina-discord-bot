const { google } = require('googleapis');
const path = require('path');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, '../credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

async function getSheetTitle() {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SPREADSHEET_ID
  });
  return spreadsheet.data.sheets[0].properties.title;
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

module.exports = {
  sheets,
  getSheetTitle,
  detectTaskDetails
};