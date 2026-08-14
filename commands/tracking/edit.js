const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, SHEET_CONFIGS, getSheetTitle, getLastDataRow, logHistory } = require('../../utils/googleSheets');

// Finds which sheet key (captain/celebi) this channel is wired to.
function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(key => SHEET_CONFIGS[key].channelId === channelId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edit the amount/credits for a specific row in the sheet for this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(option => option.setName('row').setDescription('Row number').setRequired(true))
    .addNumberOption(option => option.setName('amount').setDescription('New amount / credits').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();

    const sheetKey = resolveSheetKey(interaction.channelId);
    if (!sheetKey) {
      return interaction.editReply('⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.');
    }
    const config = SHEET_CONFIGS[sheetKey];

    if (!config.spreadsheetId) return interaction.editReply(`⚠️ **${config.label}** sheet is not configured (missing spreadsheet ID env var).`);

    const rowNum = interaction.options.getInteger('row');
    const newAmount = interaction.options.getNumber('amount');
    if (rowNum < config.startRow) return interaction.editReply(`⚠️ Row number must be ${config.startRow} or higher.`);

    const sheetTitle = await getSheetTitle(config.spreadsheetId);
    const lastRow = await getLastDataRow(config.spreadsheetId, sheetTitle, config.startRow, config.colLetters.provider || config.colLetters.date);
    if (rowNum > lastRow) {
      return interaction.editReply(`⚠️ Row **${rowNum}** doesn't exist (sheet only has data up to row ${lastRow}).`);
    }

    const amountCol = config.colLetters.amount || config.colLetters.credits;
    const range = `'${sheetTitle}'!${amountCol}${rowNum}`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range });
    const oldValues = res.data.values || [];

    await logHistory(config.spreadsheetId, {
      user: interaction.user.tag,
      command: 'edit',
      range,
      oldValues,
      newValues: [[newAmount]]
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newAmount]] }
    });

    return interaction.editReply(`✏️ [${config.label}] Row **${rowNum}** updated to **${newAmount}**!`);
  }
};