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

// Detect platform & default price from link
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

  const finalAmount = customAmount && !isNaN(customAmount) ? parseFloat(customAmount) : defaultAmount;
  return { taskType, amount: finalAmount };
}

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    if (message.content === '!ping') {
      return message.reply('Pong! Bot is working ✅');
    }

    const prefix = '!log';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);

    if (args.length < 1 || !args[0].startsWith('http')) {
      return message.reply(
        '⚠️ **Usage:** `!log <Link>` or `!log <Link> [Amount]`\n**Example:** `!log https://x.com/...`'
      );
    }

    const link = args[0];
    const customAmount = args[1];

    const { taskType, amount } = detectTaskDetails(link, customAmount);

    const today = new Date();
    const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
    const paymentStatus = 'Not Paid';

    // Set explicitly to 'captain'!A:E
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'captain'!A:E",
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
    console.error('Error handling command:', error);
    message.reply(`❌ **Error:** ${error.message || 'Failed to append row.'}`);
  }
});

client.login(process.env.DISCORD_TOKEN);