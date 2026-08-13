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

// Global variable to store backup for !undogod
let godCommandBackup = null;

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  try {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID
    });
    console.log(`✅ Connected to Sheet: "${spreadsheet.data.properties.title}"`);
  } catch (err) {
    console.error(`❌ Sheet Connection Error: ${err.message}`);
  }
});

// Helper function to auto-detect platform & price from link
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

// Fetch dynamic active sheet title
async function getSheetTitle() {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SPREADSHEET_ID
  });
  return spreadsheet.data.sheets[0].properties.title;
}

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    if (message.content === '!ping') {
      return message.reply('Pong! Bot is working ✅');
    }

    const args = message.content.trim().split(/ +/);
    const command = args[0].toLowerCase();

    // -------------------------------------------------------------
    // 1. !log <link> [amount] -> Append entry & check duplicates
    // -------------------------------------------------------------
    if (command === '!log') {
      if (args.length < 2 || !args[1].startsWith('http')) {
        return message.reply('⚠️ **Usage:** `!log <Link>` or `!log <Link> [Amount]`');
      }

      const link = args[1];
      const customAmount = args[2];
      const sheetTitle = await getSheetTitle();

      // Check duplicates in Column E
      const existingData = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!E:E`
      });

      const rows = existingData.data.values || [];
      const duplicateIndex = rows.findIndex(row => row[0] && row[0].trim() === link.trim());
      if (duplicateIndex !== -1) {
        return message.reply(`⚠️ **Duplicate Link detected!** Already logged on row **${duplicateIndex + 1}**.`);
      }

      const { taskType, amount } = detectTaskDetails(link, customAmount);
      const today = new Date();
      const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
      const paymentStatus = 'Not Paid';

      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A:E`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[formattedDate, taskType, amount, paymentStatus, link]]
        }
      });

      if (response.status === 200) {
        return message.reply(
          `✅ **Entry Logged!**\n📅 **Date:** ${formattedDate}\n📝 **Type:** ${taskType}\n💵 **Amount:** $${amount.toFixed(2)}\n📌 **Status:** ${paymentStatus}\n🔗 **Link:** ${link}`
        );
      }
    }

    // -------------------------------------------------------------
    // 2. !check <link> -> Verify if link exists
    // -------------------------------------------------------------
    if (command === '!check') {
      if (args.length < 2) return message.reply('⚠️ **Usage:** `!check <Link>`');

      const targetLink = args[1].trim();
      const sheetTitle = await getSheetTitle();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A:E`
      });

      const rows = response.data.values || [];
      let foundIndex = -1;
      let foundData = null;

      for (let i = 0; i < rows.length; i++) {
        if (rows[i][4] && rows[i][4].trim() === targetLink) {
          foundIndex = i + 1;
          foundData = rows[i];
          break;
        }
      }

      if (foundIndex !== -1) {
        return message.reply(
          `🔍 **Link Found at Row ${foundIndex}!**\n📅 **Date:** ${foundData[0]}\n📝 **Type:** ${foundData[1]}\n💵 **Amount:** ${foundData[2]}\n📌 **Status:** ${foundData[3]}`
        );
      } else {
        return message.reply('❌ **Link not found** in the spreadsheet.');
      }
    }

    // -------------------------------------------------------------
    // 3. !paid <row> | !paidrange <start> <end> | !paidall
    // -------------------------------------------------------------
    if (command === '!paid') {
      const rowNum = parseInt(args[1]);
      if (isNaN(rowNum) || rowNum < 2) return message.reply('⚠️ **Usage:** `!paid <RowNumber>` (e.g., `!paid 2`)');

      const sheetTitle = await getSheetTitle();
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Paid']] }
      });

      return message.reply(`✅ Row **${rowNum}** updated to **Paid**!`);
    }

    if (command === '!paidrange') {
      const start = parseInt(args[1]);
      const end = parseInt(args[2]);

      if (isNaN(start) || isNaN(end) || start > end || start < 2) {
        return message.reply('⚠️ **Usage:** `!paidrange <StartRow> <EndRow>`');
      }

      const sheetTitle = await getSheetTitle();
      const values = Array(end - start + 1).fill(['Paid']);

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D${start}:D${end}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });

      return message.reply(`✅ Rows **${start} to ${end}** updated to **Paid**!`);
    }

    if (command === '!paidall') {
      const sheetTitle = await getSheetTitle();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D2:D`
      });

      const rows = response.data.values || [];
      if (rows.length === 0) return message.reply('ℹ️ No entries to update.');

      const values = rows.map(() => ['Paid']);

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D2:D${rows.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });

      return message.reply(`✅ All **${rows.length}** rows updated to **Paid**!`);
    }

    // -------------------------------------------------------------
    // 4. !unpaid -> List all unpaid rows
    // -------------------------------------------------------------
    if (command === '!unpaid') {
      const sheetTitle = await getSheetTitle();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A2:E`
      });

      const rows = response.data.values || [];
      const unpaidRows = [];

      rows.forEach((row, index) => {
        const status = row[3] ? row[3].trim() : '';
        if (status === 'Not Paid') {
          unpaidRows.push(`• **Row ${index + 2}:** ${row[1]} - ${row[2]} (${row[0]})`);
        }
      });

      if (unpaidRows.length === 0) {
        return message.reply('🎉 **All caught up!** No unpaid tasks found.');
      }

      return message.reply(`⏳ **Unpaid Tasks (${unpaidRows.length}):**\n` + unpaidRows.slice(0, 15).join('\n') + (unpaidRows.length > 15 ? '\n*...and more*' : ''));
    }

    // -------------------------------------------------------------
    // 5. !edit <row> <amount> -> Override amount in Column C
    // -------------------------------------------------------------
    if (command === '!edit') {
      const rowNum = parseInt(args[1]);
      const newAmount = parseFloat(args[2]);

      if (isNaN(rowNum) || isNaN(newAmount) || rowNum < 2) {
        return message.reply('⚠️ **Usage:** `!edit <RowNumber> <NewAmount>` (e.g., `!edit 2 0.50`)');
      }

      const sheetTitle = await getSheetTitle();
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!C${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[newAmount]] }
      });

      return message.reply(`✏️ Row **${rowNum}** amount updated to **$${newAmount.toFixed(2)}**!`);
    }

    // -------------------------------------------------------------
    // 6. !undo -> Clears the last appended row
    // -------------------------------------------------------------
    if (command === '!undo') {
      const sheetTitle = await getSheetTitle();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A:E`
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) {
        return message.reply('⚠️ No entries available to undo.');
      }

      const lastRow = rows.length;
      await sheets.spreadsheets.values.clear({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A${lastRow}:E${lastRow}`
      });

      return message.reply(`↩️ Undone! Row **${lastRow}** cleared.`);
    }

    // -------------------------------------------------------------
    // 7. !delete <row> -> Clears a specific row
    // -------------------------------------------------------------
    if (command === '!delete') {
      const rowNum = parseInt(args[1]);
      if (isNaN(rowNum) || rowNum < 2) {
        return message.reply('⚠️ **Usage:** `!delete <RowNumber>` (e.g., `!delete 5`)');
      }

      const sheetTitle = await getSheetTitle();
      await sheets.spreadsheets.values.clear({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A${rowNum}:E${rowNum}`
      });

      return message.reply(`🗑️ Row **${rowNum}** cleared!`);
    }

    // -------------------------------------------------------------
    // 8. !recent [count] -> Show recent entries
    // -------------------------------------------------------------
    if (command === '!recent') {
      const count = parseInt(args[1]) || 5;
      const sheetTitle = await getSheetTitle();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A2:E`
      });

      const rows = response.data.values || [];
      if (rows.length === 0) return message.reply('ℹ️ No entries found.');

      const recentRows = rows.slice(-count).reverse();
      const formatted = recentRows.map((r, i) => `• **Row ${rows.length + 1 - i}:** ${r[1]} | ${r[2]} | ${r[3]} | ${r[0]}`).join('\n');

      return message.reply(`📋 **Last ${recentRows.length} Entries:**\n` + formatted);
    }

    // -------------------------------------------------------------
    // 9. !stats / !total -> Show overall summary
    // -------------------------------------------------------------
    if (command === '!stats' || command === '!total') {
      const sheetTitle = await getSheetTitle();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A2:E`
      });

      const rows = response.data.values || [];
      let totalAmount = 0;
      let unpaidAmount = 0;
      let paidCount = 0;
      let unpaidCount = 0;

      rows.forEach(row => {
        const rawAmount = parseFloat(row[2] ? row[2].toString().replace('$', '') : 0) || 0;
        const status = row[3] ? row[3].trim() : '';

        totalAmount += rawAmount;
        if (status === 'Paid') {
          paidCount++;
        } else if (status === 'Not Paid') {
          unpaidAmount += rawAmount;
          unpaidCount++;
        }
      });

      return message.reply(
        `📊 **Sheet Overview**\n` +
        `--------------------\n` +
        `🔢 **Total Entries:** ${rows.length}\n` +
        `💵 **Total Earnings:** $${totalAmount.toFixed(2)}\n` +
        `⏳ **Unpaid Amount:** $${unpaidAmount.toFixed(2)} (${unpaidCount} tasks)\n` +
        `✅ **Paid Count:** ${paidCount} tasks`
      );
    }

    // -------------------------------------------------------------
    // 10. GOD COMMAND: !cleartable -> Clears A2:E with backup
    // -------------------------------------------------------------
    if (command === '!cleartable') {
      const sheetTitle = await getSheetTitle();

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A2:E`
      });

      const existingData = response.data.values || [];

      if (existingData.length === 0) {
        return message.reply('⚠️ Sheet is already empty from row 2 onward.');
      }

      godCommandBackup = {
        sheetTitle,
        data: existingData
      };

      await sheets.spreadsheets.values.clear({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A2:E`
      });

      return message.reply(
        '⚡ **GOD COMMAND EXECUTED:** Every entry from **A2 to E** has been completely cleared!\n' +
        '💡 *Accident? Type `!undogod` to restore all deleted rows.*'
      );
    }

    // -------------------------------------------------------------
    // 11. UNDO GOD COMMAND: !undogod
    // -------------------------------------------------------------
    if (command === '!undogod') {
      if (!godCommandBackup || godCommandBackup.data.length === 0) {
        return message.reply('❌ **Nothing to restore!** Either no backup exists or the bot was restarted.');
      }

      const { sheetTitle, data } = godCommandBackup;

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: data }
      });

      const restoredCount = data.length;
      godCommandBackup = null;

      return message.reply(`🛡️ **GOD COMMAND UNDONE!** Restored **${restoredCount}** rows back to **A2:E**.`);
    }

  } catch (error) {
    console.error('Error handling command:', error);
    message.reply(`❌ **Error:** ${error.message || 'An unexpected error occurred.'}`);
  }
});

client.login(process.env.DISCORD_TOKEN);