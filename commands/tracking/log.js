const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const {
  sheets,
  SHEET_CONFIGS,
  getSheetTitle,
  getLastDataRow,
  detectTaskDetails,
  detectCelebiTaskDetails,
  logHistory,
} = require('../../utils/googleSheets');

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
    ),

  async execute(interaction) {
    const sheetKey = resolveSheetKey(interaction.channelId);

    if (!sheetKey) {
      return interaction.reply({
        content:
          "⚠️ This channel isn't linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.",
        ephemeral: true,
      });
    }

    const config = SHEET_CONFIGS[sheetKey];

    if (!config.spreadsheetId) {
      return interaction.reply({
        content: `⚠️ **${config.label}** sheet is not configured (missing spreadsheet ID env var).`,
        ephemeral: true,
      });
    }

    const link = interaction.options.getString('link');

    await interaction.deferReply();

    const sheetTitle = await getSheetTitle(config.spreadsheetId);

    // Duplicate link check on original sheet
    const linkCol = config.colLetters.link;
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `'${sheetTitle}'!${linkCol}${config.startRow}:${linkCol}`,
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

    // Also check celebi copy sheet for duplicates
    if (sheetKey === 'celebi') {
      const celebiCopyConfig = SHEET_CONFIGS.celebiCopy;
      const copySheetTitle = await getSheetTitle(celebiCopyConfig.spreadsheetId);
      const copyExistingData = await sheets.spreadsheets.values.get({
        spreadsheetId: celebiCopyConfig.spreadsheetId,
        range: `'${copySheetTitle}'!${linkCol}${celebiCopyConfig.startRow}:${linkCol}`,
      });
      const copyExistingLinks = copyExistingData.data.values || [];
      const copyDuplicateIndex = copyExistingLinks.findIndex(
        row => row[0] && row[0].trim() === link.trim()
      );

      if (copyDuplicateIndex !== -1) {
        return interaction.editReply(
          `⚠️ **Duplicate Link detected!** Already logged on row **${copyDuplicateIndex + celebiCopyConfig.startRow}** in Celebi Copy sheet.`
        );
      }
    }

    const today = new Date();
    const formattedDate =
      `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

    // =========================
    // CAPTAIN
    // =========================
    if (sheetKey === 'captain') {
      const customAmount = interaction.options.getNumber('amount');
      const { taskType, amount } = detectTaskDetails(link, customAmount);

      const newRow = [formattedDate, taskType, amount, 'Not Paid', link];

      const replyText =
        `✅ **Logged to Captain!**\n` +
        `📅 **Date:** ${formattedDate}\n` +
        `📝 **Type:** ${taskType}\n` +
        `💵 **Amount:** $${amount.toFixed(2)}\n` +
        `🔗 **Link:** ${link}`;

      const lastRow = await getLastDataRow(
        config.spreadsheetId,
        sheetTitle,
        config.startRow,
        config.colLetters.provider || config.colLetters.date
      );
      const nextRow = Math.max(lastRow + 1, config.startRow);
      const range = `'${sheetTitle}'!A${nextRow}:${config.lastCol}${nextRow}`;

      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] },
      });

      await logHistory(config.spreadsheetId, {
        user: interaction.user.tag,
        command: 'log',
        range,
        oldValues: [],
        newValues: [newRow],
      });

      return interaction.editReply(replyText);
    }

    // =========================
    // CELEBI
    // =========================
    const isReddit = link.toLowerCase().includes('reddit.com');
    const celebiCopyConfig = SHEET_CONFIGS.celebiCopy;

    // Helper: write row to a sheet
    async function writeToSheet(sheetConfig, row) {
      const st = await getSheetTitle(sheetConfig.spreadsheetId);
      const lastRow = await getLastDataRow(
        sheetConfig.spreadsheetId,
        st,
        sheetConfig.startRow,
        sheetConfig.colLetters.provider || sheetConfig.colLetters.date
      );
      const nextRow = Math.max(lastRow + 1, sheetConfig.startRow);
      const rng = `'${st}'!A${nextRow}:${sheetConfig.lastCol}${nextRow}`;

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetConfig.spreadsheetId,
        range: rng,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });

      await logHistory(sheetConfig.spreadsheetId, {
        user: interaction.user.tag,
        command: 'log',
        range: rng,
        oldValues: [],
        newValues: [row],
      });
    }

    if (!isReddit) {
      const provider = 'CELEBI';
      const account = 'MAIN';
      const { taskType, credits } = detectCelebiTaskDetails(link);

      const newRow = [
        provider,
        formattedDate,
        link,
        account,
        taskType,
        credits,
        'LIVE',
        '',
      ];

      // Log to original celebi sheet
      await writeToSheet(config, newRow);

      // Log to celebi copy sheet
      await writeToSheet(celebiCopyConfig, newRow);

      const replyText =
        `✅ **Logged to Celebi!**\n` +
        `🏷️ **Provider:** ${provider}\n` +
        `📅 **Date:** ${formattedDate}\n` +
        `📝 **Type:** ${taskType}\n` +
        `💳 **Credits:** $${credits.toFixed(2)}\n` +
        `🔗 **Link:** ${link}`;

      return interaction.editReply(replyText);
    }

    // Reddit → ask account via select menu, log to celebi copy only

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`celebi_account_${interaction.user.id}`)
        .setPlaceholder('Choose account...')
        .addOptions([
          { label: 'MAIN', value: 'MAIN' },
          { label: 'Alt 1', value: 'Alt 1' },
        ])
    );

    const selectMsg = await interaction.editReply({
      content: '👤 **Which account is this for?**',
      components: [selectRow],
    });

    try {
      const selection = await selectMsg.awaitMessageComponent({
        filter: i =>
          i.customId === `celebi_account_${interaction.user.id}` &&
          i.user.id === interaction.user.id,
        time: 60_000,
      });

      await selection.deferUpdate();

      const account = selection.values[0];

      const provider = 'CELEBI';
      const { taskType, credits } = detectCelebiTaskDetails(link);

      const newRow = [
        provider,
        formattedDate,
        link,
        account,
        taskType,
        credits,
        'LIVE',
        '',
      ];

      const replyText =
        `✅ **Logged to Celebi!**\n` +
        `🏷️ **Provider:** ${provider}\n` +
        `📅 **Date:** ${formattedDate}\n` +
        `👤 **Account:** ${account}\n` +
        `📝 **Type:** ${taskType}\n` +
        `💳 **Credits:** $${credits.toFixed(2)}\n` +
        `🔗 **Link:** ${link}`;

      // Reddit tasks log to celebi copy sheet only
      await writeToSheet(celebiCopyConfig, newRow);

      await interaction.editReply({
        content: replyText,
        components: [],
      });
    } catch {
      try {
        await interaction.editReply({
          content: '⏰ Account selection timed out. Please try again.',
          components: [],
        });
      } catch {
        // interaction fully expired
      }
    }
  },
};