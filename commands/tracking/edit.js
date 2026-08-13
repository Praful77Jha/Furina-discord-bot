const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, getSheetTitle, getLastDataRow, logHistory } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edit amount for a specific row')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(option => option.setName('row').setDescription('Row number').setRequired(true))
    .addNumberOption(option => option.setName('amount').setDescription('New amount').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const rowNum = interaction.options.getInteger('row');
    const newAmount = interaction.options.getNumber('amount');
    if (rowNum < 2) return interaction.editReply('⚠️ Row number must be 2 or higher.');

    const sheetTitle = await getSheetTitle();
    const lastRow = await getLastDataRow();
    if (rowNum > lastRow) {
      return interaction.editReply(`⚠️ Row **${rowNum}** doesn't exist (sheet only has data up to row ${lastRow}).`);
    }

    const range = `'${sheetTitle}'!C${rowNum}`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range
    });
    const oldValues = res.data.values || [];

    await logHistory({
      user: interaction.user.tag,
      command: 'edit',
      range,
      oldValues,
      newValues: [[newAmount]]
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newAmount]] }
    });

    return interaction.editReply(`✏️ Row **${rowNum}** amount updated to **$${newAmount.toFixed(2)}**!`);
  }
};
