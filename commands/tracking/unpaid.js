const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, getSheetTitle, getLastDataRow, logHistory } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unpaid')
    .setDescription('View or update unpaid tasks')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('list').setDescription('List all unpaid entries'))
    .addSubcommand(sub => sub.setName('all').setDescription('Mark ALL rows as Not Paid'))
    .addSubcommand(sub => sub.setName('row').setDescription('Set a single row to Not Paid')
      .addIntegerOption(opt => opt.setName('number').setDescription('Row number').setRequired(true)))
    .addSubcommand(sub => sub.setName('range').setDescription('Mark a range of rows as Not Paid')
      .addIntegerOption(opt => opt.setName('start').setDescription('Start row').setRequired(true))
      .addIntegerOption(opt => opt.setName('end').setDescription('End row').setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply();
    const subcommand = interaction.options.getSubcommand();
    const sheetTitle = await getSheetTitle();

    if (subcommand === 'list') {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: `'${sheetTitle}'!A2:E` });
      const rows = response.data.values || [];
      const unpaidRows = [];
      rows.forEach((r, i) => {
        if (r[3] && r[3].trim() === 'Not Paid') unpaidRows.push(`• **Row ${i + 2}:** ${r[1]} - $${r[2]} (${r[0]})`);
      });

      if (unpaidRows.length === 0) return interaction.editReply('🎉 **All caught up!** No unpaid tasks found.');
      return interaction.editReply(`⏳ **Unpaid Tasks (${unpaidRows.length}):**\n` + unpaidRows.slice(0, 15).join('\n') + (unpaidRows.length > 15 ? '\n*...and more*' : ''));
    }

    const lastRow = await getLastDataRow();

    if (subcommand === 'all') {
      if (lastRow < 2) return interaction.editReply('ℹ️ No entries to update.');
      const range = `'${sheetTitle}'!D2:D${lastRow}`;
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range });
      const rows = res.data.values || [];
      if (rows.length === 0) return interaction.editReply('ℹ️ No entries to update.');

      const newValues = rows.map(() => ['Not Paid']);
      await logHistory({ user: interaction.user.tag, command: 'unpaid all', range, oldValues: rows, newValues });

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newValues }
      });
      return interaction.editReply(`🔄 All **${rows.length}** rows updated back to **Not Paid**!`);
    }

    if (subcommand === 'row') {
      const row = interaction.options.getInteger('number');
      if (row < 2) return interaction.editReply('⚠️ Row number must be 2 or higher.');
      if (row > lastRow) return interaction.editReply(`⚠️ Row **${row}** doesn't exist (sheet only has data up to row ${lastRow}).`);

      const range = `'${sheetTitle}'!D${row}`;
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range });
      const oldValues = res.data.values || [];

      await logHistory({ user: interaction.user.tag, command: 'unpaid row', range, oldValues, newValues: [['Not Paid']] });

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Not Paid']] }
      });
      return interaction.editReply(`🔄 Row **${row}** updated back to **Not Paid**!`);
    }

    if (subcommand === 'range') {
      const start = interaction.options.getInteger('start');
      const end = interaction.options.getInteger('end');
      if (start < 2) return interaction.editReply('⚠️ Start row must be 2 or higher.');
      if (end < start) return interaction.editReply('⚠️ End row must be greater than or equal to start row.');
      if (end > lastRow) return interaction.editReply(`⚠️ Row **${end}** doesn't exist (sheet only has data up to row ${lastRow}).`);

      const range = `'${sheetTitle}'!D${start}:D${end}`;
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range });
      const oldValues = res.data.values || [];
      const newValues = Array(end - start + 1).fill(['Not Paid']);

      await logHistory({ user: interaction.user.tag, command: 'unpaid range', range, oldValues, newValues });

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newValues }
      });
      return interaction.editReply(`🔄 Rows **${start} to ${end}** updated back to **Not Paid**!`);
    }
  }
};
