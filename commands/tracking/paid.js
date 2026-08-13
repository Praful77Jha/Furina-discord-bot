const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('paid')
    .setDescription('Mark entries as Paid')
    .addIntegerOption(option => option.setName('row').setDescription('Single row number'))
    .addIntegerOption(option => option.setName('start').setDescription('Start row for range'))
    .addIntegerOption(option => option.setName('end').setDescription('End row for range'))
    .addStringOption(option => 
      option
        .setName('all')
        .setDescription('Mark ALL rows as Paid')
        .addChoices({ name: 'all', value: 'all' })
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const row = interaction.options.getInteger('row');
    const start = interaction.options.getInteger('start');
    const end = interaction.options.getInteger('end');
    const all = interaction.options.getString('all');
    const sheetTitle = await getSheetTitle();

    if (all === 'all') {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: `'${sheetTitle}'!D2:D` });
      const rows = res.data.values || [];
      if (rows.length === 0) return interaction.editReply('ℹ️ No entries to update.');
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D2:D${rows.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows.map(() => ['Paid']) }
      });
      return interaction.editReply(`✅ All **${rows.length}** rows marked as **Paid**!`);
    }

    if (start && end) {
      const values = Array(end - start + 1).fill(['Paid']);
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D${start}:D${end}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
      return interaction.editReply(`✅ Rows **${start} to ${end}** marked as **Paid**!`);
    }

    if (row) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D${row}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Paid']] }
      });
      return interaction.editReply(`✅ Row **${row}** marked as **Paid**!`);
    }

    return interaction.editReply('⚠️ Please specify `row`, `start` & `end`, or select `all`.');
  }
};