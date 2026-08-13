const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unpaid')
    .setDescription('View or update unpaid tasks')
    .addBooleanOption(option => option.setName('list').setDescription('List all unpaid entries'))
    .addIntegerOption(option => option.setName('row').setDescription('Set single row to Not Paid'))
    .addIntegerOption(option => option.setName('start').setDescription('Start row for range'))
    .addIntegerOption(option => option.setName('end').setDescription('End row for range'))
    .addStringOption(option => 
      option
        .setName('all')
        .setDescription('Mark ALL rows as Not Paid')
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
        requestBody: { values: rows.map(() => ['Not Paid']) }
      });
      return interaction.editReply(`🔄 All **${rows.length}** rows updated back to **Not Paid**!`);
    }

    if (start && end) {
      const values = Array(end - start + 1).fill(['Not Paid']);
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D${start}:D${end}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
      return interaction.editReply(`🔄 Rows **${start} to ${end}** updated back to **Not Paid**!`);
    }

    if (row) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${sheetTitle}'!D${row}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Not Paid']] }
      });
      return interaction.editReply(`🔄 Row **${row}** updated back to **Not Paid**!`);
    }

    const response = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: `'${sheetTitle}'!A2:E` });
    const rows = response.data.values || [];
    const unpaidRows = [];
    rows.forEach((r, i) => {
      if (r[3] && r[3].trim() === 'Not Paid') unpaidRows.push(`• **Row ${i + 2}:** ${r[1]} - $${r[2]} (${r[0]})`);
    });

    if (unpaidRows.length === 0) return interaction.editReply('🎉 **All caught up!** No unpaid tasks found.');
    return interaction.editReply(`⏳ **Unpaid Tasks (${unpaidRows.length}):**\n` + unpaidRows.slice(0, 15).join('\n') + (unpaidRows.length > 15 ? '\n*...and more*' : ''));
  }
};