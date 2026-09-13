const {
  SlashCommandBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
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
    const sheetTitle = await getSheetTitle(config.spreadsheetId);

    // Duplicate link check
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
      return interaction.reply({
        content: `⚠️ **Duplicate Link detected!** Already logged on row **${duplicateIndex + config.startRow}**.`,
        ephemeral: true,
      });
    }

    const today = new Date();
    const formattedDate =
      `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

    // =========================
    // CAPTAIN
    // =========================
    if (sheetKey === 'captain') {
      await interaction.deferReply();

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
    // CELEBI — Modal for account
    // =========================
    const modal = new ModalBuilder()
      .setCustomId(`celebi_log_${Date.now()}_${interaction.user.id}`)
      .setTitle('Celebi – Select Account');

    const accountInput = new TextInputBuilder()
      .setCustomId('account')
      .setLabel('Account (MAIN or Alt 1)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Type MAIN or Alt 1')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(accountInput));
    await interaction.showModal(modal);

    try {
      const modalInteraction = await interaction.awaitModalSubmit({
        filter: i =>
          i.customId.startsWith('celebi_log_') &&
          i.user.id === interaction.user.id,
        time: 60_000,
      });

      await modalInteraction.deferReply();

      const account =
        modalInteraction.fields.getTextInputValue('account').trim();

      if (!['MAIN', 'Alt 1'].includes(account)) {
        return modalInteraction.editReply(
          '⚠️ **Invalid account.** Please type exactly **MAIN** or **Alt 1**.'
        );
      }

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

      return modalInteraction.editReply(replyText);
    } catch {
      try {
        await interaction.followUp({
          content: '⏰ Account selection timed out. Please try again.',
          ephemeral: true,
        });
      } catch {
        // interaction fully expired
      }
    }
  },
};