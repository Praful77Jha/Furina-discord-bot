const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('undo')
    .setDescription('Clear the very last logged row'),

  async execute(interaction) {
    await interaction.deferReply();
    const sheetTitle = await getSheetTitle();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${sheetTitle}'!A:E`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return interaction.editReply('⚠️ No entries available to undo.');

    const lastRow = rows.length;
    await sheets.spreadsheets.values.clear({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${sheetTitle}'!A${lastRow}:E${lastRow}`
    });

    return interaction.editReply(`↩️ Undone! Row **${lastRow}** cleared.`);
  }
};