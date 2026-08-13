const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, getSheetTitle, getLastDataRow, logHistory } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('paid')
    .setDescription('Mark entries as Paid')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
    const lastRow = await getLastDataRow();

    if (subcommand === 'all') {
      if (lastRow < 2) return interaction.editReply('ℹ️ No entries to update.');
      const range = `'${sheetTitle}'!D2:D${lastRow}`;
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range });
      const rows = res.data.values || [];
      if (rows.length === 0) return interaction.editReply('ℹ️ No entries to update.');

      const newValues = rows.map(() => ['Paid']);
      await logHistory({ user: interaction.user.tag, command: 'paid all', range, oldValues: rows, newValues });

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newValues }
      });
      return interaction.editReply(`✅ All **${rows.length}** rows marked as **Paid**!`);
    }

    if (subcommand === 'row') {
      const row = interaction.options.getInteger('number');
      if (row < 2) return interaction.editReply('⚠️ Row number must be 2 or higher.');
      if (row > lastRow) return interaction.editReply(`⚠️ Row **${row}** doesn't exist (sheet only has data up to row ${lastRow}).`);

      const range = `'${sheetTitle}'!D${row}`;
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range });
      const oldValues = res.data.values || [];

      await logHistory({ user: interaction.user.tag, command: 'paid row', range, oldValues, newValues: [['Paid']] });

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Paid']] }
      });
      return interaction.editReply(`✅ Row **${row}** marked as **Paid**!`);
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
      const newValues = Array(end - start + 1).fill(['Paid']);

      await logHistory({ user: interaction.user.tag, command: 'paid range', range, oldValues, newValues });

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newValues }
      });
      return interaction.editReply(`✅ Rows **${start} to ${end}** marked as **Paid**!`);
    }
  }
};
