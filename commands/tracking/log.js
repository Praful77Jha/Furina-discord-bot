const { SlashCommandBuilder } = require('discord.js');
const {
  sheets,
  SHEET_CONFIGS,
  getSheetTitle,
  getLastDataRow,
  detectTaskDetails,
  detectCelebiTaskDetails,
  logHistory
} = require('../../utils/googleSheets');

// Finds which sheet key (captain/celebi) this channel is wired to.
function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(
    key => SHEET_CONFIGS[key].channelId === channelId
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Log a new task entry')
    .addStringOption(option =>
      option
        .setName('link')
        .setDescription('The task link')
        .setRequired(true)
    )
    .addNumberOption(option =>
      option
        .setName('amount')
        .setDescription('Custom amount (Captain only)')
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const sheetKey = resolveSheetKey(interaction.channelId);

    if (!sheetKey) {
      return interaction.editReply(
        '⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.'
      );
    }

    const config = SHEET_CONFIGS[sheetKey];

    if (!config.spreadsheetId) {
      return interaction.editReply(
        `⚠️ **${config.label}** sheet is not configured (missing spreadsheet ID env var).`
      );
    }

    const link = interaction.options.getString('link');
    const sheetTitle = await getSheetTitle(config.spreadsheetId);

    // Duplicate link check
    const linkCol = config.colLetters.link;

    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `'${sheetTitle}'!${linkCol}${config.startRow}:${linkCol}`
    });

    const existingLinks = existingData.data.values || [];

    const duplicateIndex = existingLinks.findIndex(
      row => row[0] && row[0].trim() === link.trim()
    );

    if (duplicateIndex !== -1) {
      return interaction.editReply(
        `⚠️ **Duplicate Link detected!** Already logged on row **${duplicateIndex + config.startRow}**.`
      );
    }

    const today = new Date();

    const formattedDate =
      `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

    let newRow;
    let replyText;

    // =========================
    // CAPTAIN
    // =========================

    if (sheetKey === 'captain') {

      const customAmount =
        interaction.options.getNumber('amount');

      const { taskType, amount } =
        detectTaskDetails(link, customAmount);

      newRow = [
        formattedDate,
        taskType,
        amount,
        'Not Paid',
        link
      ];

      replyText =
        `✅ **Logged to Captain!**\n` +
        `📅 **Date:** ${formattedDate}\n` +
        `📝 **Type:** ${taskType}\n` +
        `💵 **Amount:** $${amount.toFixed(2)}\n` +
        `🔗 **Link:** ${link}`;

    }

    // =========================
    // CELEBI
    // =========================

    else {

      // Celebi is now fixed to these values.
      // The user no longer needs to select them.
      const provider = 'CELEBI';
      const account = 'MAIN';

      const { taskType, credits } =
        detectCelebiTaskDetails(link);

      newRow = [
        provider,
        formattedDate,
        link,
        account,
        taskType,
        credits,
        'LIVE',
        ''
      ];

      replyText =
        `✅ **Logged to Celebi!**\n` +
        `🏷️ **Provider:** ${provider}\n` +
        `📅 **Date:** ${formattedDate}\n` +
        `👤 **Account:** ${account}\n` +
        `📝 **Type:** ${taskType}\n` +
        `💳 **Credits:** $${credits.toFixed(2)}\n` +
        `🔗 **Link:** ${link}`;
    }

    // Find next available row.
    const lastRow = await getLastDataRow(
      config.spreadsheetId,
      sheetTitle,
      config.startRow,
      config.colLetters.provider || config.colLetters.date
    );

    const nextRow =
      Math.max(lastRow + 1, config.startRow);

    const range =
      `'${sheetTitle}'!A${nextRow}:${config.lastCol}${nextRow}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [newRow]
      }
    });

    await logHistory(config.spreadsheetId, {
      user: interaction.user.tag,
      command: 'log',
      range,
      oldValues: [],
      newValues: [newRow]
    });

    return interaction.editReply(replyText);
  }
};