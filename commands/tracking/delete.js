const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, SHEET_CONFIGS, getSheetTitle, logHistory } = require('../../utils/googleSheets');

// Finds which sheet key (captain/celebi) this channel is wired to.
function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(key => SHEET_CONFIGS[key].channelId === channelId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Clear a specific row or column in the sheet for this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(option => option.setName('row').setDescription('Row number to delete').setRequired(true))
    .addStringOption(option => option.setName('column').setDescription('Single column letter (e.g. A)').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const sheetKey = resolveSheetKey(interaction.channelId);
    if (!sheetKey) {
      return interaction.editReply('⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.');
    }
    const config = SHEET_CONFIGS[sheetKey];

    if (!config.spreadsheetId) {
      return interaction.editReply(`⚠️ **${config.label}** sheet is not configured (missing spreadsheet ID env var).`);
    }

    const rowNum = interaction.options.getInteger('row');
    const column = interaction.options.getString('column');
    if (rowNum < config.startRow) {
      return interaction.editReply(`⚠️ Row number must be **${config.startRow}** or higher for **${config.label}**.`);
    }

    const sheetTitle = await getSheetTitle(config.spreadsheetId);

    let range;
    let col = null;
    if (column) {
      col = column.trim().toUpperCase();
      if (!/^[A-Z]$/.test(col)) return interaction.editReply('⚠️ Column must be a single letter (e.g. A).');
      range = `'${sheetTitle}'!${col}${config.startRow}:${col}${rowNum}`;
    } else {
      range = `'${sheetTitle}'!A${rowNum}:${config.lastCol}${rowNum}`;
    }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range
    });
    const oldValues = res.data.values || [];

    await logHistory(config.spreadsheetId, {
      user: interaction.user.tag,
      command: col ? 'delete column' : 'delete row',
      range,
      oldValues,
      newValues: []
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: config.spreadsheetId,
      range
    });

    return interaction.editReply(
      col
        ? `🗑️ [${config.label}] Column **${col}** cleared from row ${config.startRow} to ${rowNum}!`
        : `🗑️ [${config.label}] Row **${rowNum}** cleared!`
    );
  }
};