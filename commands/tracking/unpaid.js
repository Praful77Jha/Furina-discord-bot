const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, SHEET_CONFIGS, getSheetTitle, getLastDataRow, logHistory } = require('../../utils/googleSheets');

function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(key => SHEET_CONFIGS[key].channelId === channelId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unpaid')
    .setDescription('View or update unpaid tasks in the sheet for this channel')
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

    const sheetKey = resolveSheetKey(interaction.channelId);
    if (!sheetKey) {
      return interaction.editReply('⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.');
    }
    const config = SHEET_CONFIGS[sheetKey];
    if (!config.spreadsheetId) return interaction.editReply(`⚠️ **${config.label}** sheet is not configured (missing spreadsheet ID env var).`);

    const sheetTitle = await getSheetTitle(config.spreadsheetId);
    const payCol = config.colLetters.pay || config.colLetters.status;
    const notPaidValue = sheetKey === 'captain' ? 'Not Paid' : 'NOT PAID';

    if (subcommand === 'list') {
      const lastCol = config.lastCol;
      const range = `'${sheetTitle}'!A${config.startRow}:${lastCol}`;
      const response = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range });
      const rows = response.data.values || [];
      const payIdx = payCol.charCodeAt(0) - 'A'.charCodeAt(0);

      const unpaidRows = [];
      if (sheetKey === 'captain') {
        rows.forEach((r, i) => {
          if (r[payIdx] && r[payIdx].trim() === 'Not Paid') unpaidRows.push(`• **Row ${i + config.startRow}:** ${r[1]} - $${r[2]} (${r[0]})`);
        });
      } else {
        rows.forEach((r, i) => {
          const pay = (r[payIdx] || '').trim().toUpperCase();
          if (pay !== 'PAID') unpaidRows.push(`• **Row ${i + config.startRow}:** ${r[0]} - ${r[4]} - ${r[5]} credits (${r[1]})`);
        });
      }

      if (unpaidRows.length === 0) return interaction.editReply(`🎉 [${config.label}] All caught up! No unpaid tasks found.`);
      return interaction.editReply(`⏳ [${config.label}] **Unpaid Tasks (${unpaidRows.length}):**\n` + unpaidRows.slice(0, 15).join('\n') + (unpaidRows.length > 15 ? '\n*...and more*' : ''));
    }

    const lastRow = await getLastDataRow(config.spreadsheetId, sheetTitle, config.startRow, config.colLetters.provider || config.colLetters.date);

    if (subcommand === 'all') {
      if (lastRow < config.startRow) return interaction.editReply('ℹ️ No entries to update.');

      const count = lastRow - config.startRow + 1;
      const range = `'${sheetTitle}'!${payCol}${config.startRow}:${payCol}${lastRow}`;

      const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range });
      const oldValues = res.data.values || [];
      while (oldValues.length < count) oldValues.push(['']);

      const newValues = Array(count).fill([notPaidValue]);
      await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'unpaid all', range, oldValues, newValues });

      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newValues }
      });
      return interaction.editReply(`🔄 [${config.label}] All **${count}** rows updated back to **Not Paid**!`);
    }

    if (subcommand === 'row') {
      const row = interaction.options.getInteger('number');
      if (row < config.startRow) return interaction.editReply(`⚠️ Row number must be ${config.startRow} or higher.`);
      if (row > lastRow) return interaction.editReply(`⚠️ Row **${row}** doesn't exist (sheet only has data up to row ${lastRow}).`);

      const range = `'${sheetTitle}'!${payCol}${row}`;
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range });
      const oldValues = res.data.values || [];

      await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'unpaid row', range, oldValues, newValues: [[notPaidValue]] });

      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[notPaidValue]] }
      });
      return interaction.editReply(`🔄 [${config.label}] Row **${row}** updated back to **Not Paid**!`);
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
      const newValues = Array(end - start + 1).fill([notPaidValue]);

      await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'unpaid range', range, oldValues, newValues });

      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newValues }
      });
      return interaction.editReply(`🔄 [${config.label}] Rows **${start} to ${end}** updated back to **Not Paid**!`);
    }
  }
};