const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Clear a specific row')
    .addIntegerOption(option => option.setName('row').setDescription('Row number to delete').setRequired(true))
    .addStringOption(option => option.setName('column').setDescription('Single column letter (e.g. A)').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const rowNum = interaction.options.getInteger('row');
    const column = interaction.options.getString('column');
    if (rowNum < 2) return interaction.editReply('⚠️ Row number must be 2 or higher.');

    const sheetTitle = await getSheetTitle();

    if (column) {
      const col = column.trim().toUpperCase();
      if (!/^[A-Z]$/.test(col)) return interaction.editReply('⚠️ Column must be a single letter (e.g. A).');

      await sheets.spreadsheets.values.clear({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!${col}2:${col}${rowNum}`
      });

      return interaction.editReply(`🗑️ Column **${col}** cleared from row 2 to ${rowNum}!`);
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${sheetTitle}'!A${rowNum}:E${rowNum}`
    });

    return interaction.editReply(`🗑️ Row **${rowNum}** cleared!`);
  }
};