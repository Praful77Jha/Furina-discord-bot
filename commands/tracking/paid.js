const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, SHEET_CONFIGS, getSheetTitle, getLastDataRow, logHistory } = require('../../utils/googleSheets');

function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(key => SHEET_CONFIGS[key].channelId === channelId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('paid')
    .setDescription('Mark entries as Paid in the sheet for this channel')
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

    const sheetKey = resolveSheetKey(interaction.channelId);
    if (!sheetKey) {
      return interaction.editReply('⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.');
    }
    const config = SHEET_CONFIGS[sheetKey];
    if (!config.spreadsheetId) return interaction.editReply(`⚠️ **${config.label}** sheet is not configured (missing spreadsheet ID env var).`);

    const sheetTitle = await getSheetTitle(config.spreadsheetId);
    const payCol = config.colLetters.pay || config.colLetters.status;
    const paidValue = sheetKey === 'captain' ? 'Paid' : 'PAID';
    const lastRow = await getLastDataRow(config.spreadsheetId, sheetTitle, config.startRow, config.colLetters.provider || config.colLetters.date);

    if (subcommand === 'all') {
      if (lastRow < config.startRow) return interaction.editReply('ℹ️ No entries to update.');

      // Count real rows from the row range itself, NOT from reading the pay
      // column - Sheets' API trims trailing empty cells from values.get, so
      // an all-blank Pay column (like Celebi's) would otherwise read as 0.
      const count = lastRow - config.startRow + 1;
      const range = `'${sheetTitle}'!${payCol}${config.startRow}:${payCol}${lastRow}`;

      const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range });
      const oldValues = res.data.values || [];
      while (oldValues.length < count) oldValues.push(['']);

      const newValues = Array(count).fill([paidValue]);
      await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'paid all', range, oldValues, newValues });

      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newValues }
      });
      return interaction.editReply(`✅ [${config.label}] All **${count}** rows marked as **Paid**!`);
    }

    if (subcommand === 'row') {
      const row = interaction.options.getInteger('number');
      if (row < config.startRow) return interaction.editReply(`⚠️ Row number must be ${config.startRow} or higher.`);
      if (row > lastRow) return interaction.editReply(`⚠️ Row **${row}** doesn't exist (sheet only has data up to row ${lastRow}).`);

      const range = `'${sheetTitle}'!${payCol}${row}`;
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range });
      const oldValues = res.data.values || [];

      await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'paid row', range, oldValues, newValues: [[paidValue]] });

      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[paidValue]] }
      });
      return interaction.editReply(`✅ [${config.label}] Row **${row}** marked as **Paid**!`);
    }

    if (subcommand === 'range') {
      const start = interaction.options.getInteger('start');
      const end = interaction.options.getInteger('end');
      if (start < config.startRow) return interaction.editReply(`⚠️ Start row must be ${config.startRow} or higher.`);
      if (end < start) return interaction.editReply('⚠️ End row must be greater than or equal to start row.');
      if (end > lastRow) return interaction.editReply(`⚠️ Row **${end}** doesn't exist (sheet only has data up to row ${lastRow}).`);

      const range = `'${sheetTitle}'!${payCol}${start}:${payCol}${end}`;
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range });
      const oldValues = res.data.values || [];
      const newValues = Array(end - start + 1).fill([paidValue]);

      await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'paid range', range, oldValues, newValues });

      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newValues }
      });
      return interaction.editReply(`✅ [${config.label}] Rows **${start} to ${end}** marked as **Paid**!`);
    }
  }
};