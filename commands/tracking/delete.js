const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Clear a specific row')
    .addIntegerOption(option => option.setName('row').setDescription('Row number to delete').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const rowNum = interaction.options.getInteger('row');
    if (rowNum < 2) return interaction.editReply('⚠️ Row number must be 2 or higher.');

    const sheetTitle = await getSheetTitle();
    await sheets.spreadsheets.values.clear({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${sheetTitle}'!A${rowNum}:E${rowNum}`
    });

    return interaction.editReply(`🗑️ Row **${rowNum}** cleared!`);
  }
};