const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edit amount for a specific row')
    .addIntegerOption(option => option.setName('row').setDescription('Row number').setRequired(true))
    .addNumberOption(option => option.setName('amount').setDescription('New amount').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const rowNum = interaction.options.getInteger('row');
    const newAmount = interaction.options.getNumber('amount');
    if (rowNum < 2) return interaction.editReply('⚠️ Row number must be 2 or higher.');

    const sheetTitle = await getSheetTitle();
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${sheetTitle}'!C${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newAmount]] }
    });

    return interaction.editReply(`✏️ Row **${rowNum}** amount updated to **$${newAmount.toFixed(2)}**!`);
  }
};