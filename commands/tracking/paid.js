const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('paid')
    .setDescription('Mark entries as Paid')
    .addSubcommand(sub => sub.setName('all').setDescription('Mark ALL rows as Paid'))
    .addSubcommand(sub => sub.setName('row').setDescription('Mark a single row')
      .addIntegerOption(opt => opt.setName('number').setDescription('Row number').setRequired(true)))
    .addSubcommand(sub => sub.setName('range').setDescription('Mark a range of rows')
      .addIntegerOption(opt => opt.setName('start').setDescription('Start row').setRequired(true))
      .addIntegerOption(opt => opt.setName('end').setDescription('End row').setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply();
    const subcommand = interaction.options.getSubcommand();
    const sheetTitle = await getSheetTitle();

    if (subcommand === 'all') {
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

    if (subcommand === 'row') {
      const row = interaction.options.getInteger('number');
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D${row}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Paid']] }
      });
      return interaction.editReply(`✅ Row **${row}** marked as **Paid**!`);
    }

    if (subcommand === 'range') {
      const start = interaction.options.getInteger('start');
      const end = interaction.options.getInteger('end');
      const values = Array(end - start + 1).fill(['Paid']);
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D${start}:D${end}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
      return interaction.editReply(`✅ Rows **${start} to ${end}** marked as **Paid**!`);
    }
  }
};