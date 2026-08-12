require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { google } = require('googleapis');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
});

// Helper function to auto-detect platform & default price from link
function detectTaskDetails(url, customAmount) {
  let taskType = 'Comment (Twitter/X)'; // default fallback
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
    defaultAmount = 0.30; // Reddit default rate based on your sheet
  }

  const finalAmount = customAmount && !isNaN(customAmount) ? parseFloat(customAmount) : defaultAmount;
  return { taskType, amount: finalAmount };
}

// Usage syntax:
// Option 1 (Easiest - Auto Detects everything): !log https://x.com/...
// Option 2 (Custom Amount):                     !log https://x.com/... 0.20
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const prefix = '!log';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);

  if (args.length < 1 || !args[0].startsWith('http')) {
    return message.reply(
      '⚠️ **Usage:** `!log <Link>` or `!log <Link> [Amount]`\n**Example:** `!log https://x.com/Not_Menace_09/status/...`'
    );
  }

  const link = args[0];
  const customAmount = args[1];

  const { taskType, amount } = detectTaskDetails(link, customAmount);

  // M/D/YYYY format matching your sheet exactly
  const today = new Date();
  const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
  const paymentStatus = 'Not Paid';

  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Sheet1!A:E', // Make sure your tab name matches ('Sheet1' or whatever your tab is named)
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[formattedDate, taskType, amount, paymentStatus, link]]
      }
    });

    if (response.status === 200) {
      message.reply(
        `✅ **Entry Logged!**\n📅 **Date:** ${formattedDate}\n📝 **Type:** ${taskType}\n💵 **Amount:** $${amount.toFixed(2)}\n📌 **Status:** ${paymentStatus}\n🔗 **Link:** ${link}`
      );
    }
  } catch (error) {
    console.error('Error appending data:', error);
    message.reply('❌ Failed to append row to Google Sheet. Check console logs.');
  }
});

client.login(process.env.DISCORD_TOKEN);