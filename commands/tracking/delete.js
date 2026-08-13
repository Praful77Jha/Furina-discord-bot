const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, getSheetTitle, logHistory } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Clear a specific row or column')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(option => option.setName('row').setDescription('Row number to delete').setRequired(true))
    .addStringOption(option => option.setName('column').setDescription('Single column letter (e.g. A)').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const rowNum = interaction.options.getInteger('row');
    const column = interaction.options.getString('column');
    if (rowNum < 2) return interaction.editReply('⚠️ Row number must be 2 or higher.');

    const sheetTitle = await getSheetTitle();

    let range;
    let col = null;
    if (column) {
      col = column.trim().toUpperCase();
      if (!/^[A-Z]$/.test(col)) return interaction.editReply('⚠️ Column must be a single letter (e.g. A).');
      range = `'${sheetTitle}'!${col}2:${col}${rowNum}`;
    } else {
      range = `'${sheetTitle}'!A${rowNum}:E${rowNum}`;
    }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range
    });
    const oldValues = res.data.values || [];

    await logHistory({
      user: interaction.user.tag,
      command: col ? 'delete column' : 'delete row',
      range,
      oldValues,
      newValues: []
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range
    });

    return interaction.editReply(
      col
        ? `🗑️ Column **${col}** cleared from row 2 to ${rowNum}!`
        : `🗑️ Row **${rowNum}** cleared!`
    );
  }
};
