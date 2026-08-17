const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  sheets,
  SHEET_CONFIGS,
  getSheetTitle,
  getLastDataRow,
  logHistory,
  detectTaskDetails,
  detectCelebiTaskDetails
} = require('../../utils/googleSheets');

function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(key => SHEET_CONFIGS[key].channelId === channelId);
}

// Amount column: Captain = C, Celebi = F (credits).
function getAmountCol(sheetKey, config) {
  return sheetKey === 'captain' ? 'C' : config.colLetters.credits;
}

// Recomputes the task rate for a row from its link, same rate used by /log.
// Returns null if it can't be determined (blank link, unrecognized pattern, etc).
function computeTaskRate(sheetKey, link) {
  if (!link || !link.toString().trim()) return null;
  try {
    if (sheetKey === 'captain') {
      const { amount } = detectTaskDetails(link);
      return Number.isFinite(amount) ? amount : null;
    } else {
      const { credits } = detectCelebiTaskDetails(link);
      return Number.isFinite(credits) ? credits : null;
    }
  } catch {
    return null;
  }
}

// Given parallel old-amount / link value arrays, builds the new amount
// column: blank cells get refilled from the task rate, everything else
// is left exactly as-is.
function refillBlankAmounts(sheetKey, oldAmountValues, linkValues, count) {
  const newAmountValues = [];
  let refilledCount = 0;
  for (let i = 0; i < count; i++) {
    const current = (oldAmountValues[i] && oldAmountValues[i][0] !== undefined) ? oldAmountValues[i][0] : '';
    if (current.toString().trim() !== '') {
      newAmountValues.push([current]);
      continue;
    }
    const link = linkValues[i] ? linkValues[i][0] : '';
    const rate = computeTaskRate(sheetKey, link);
    if (rate !== null) {
      newAmountValues.push([rate]);
      refilledCount++;
    } else {
      newAmountValues.push(['']);
    }
  }
  return { newAmountValues, refilledCount };
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
    const amountCol = getAmountCol(sheetKey, config);
    const linkCol = config.colLetters.link;
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
      const payRange = `'${sheetTitle}'!${payCol}${config.startRow}:${payCol}${lastRow}`;
      const amountRange = `'${sheetTitle}'!${amountCol}${config.startRow}:${amountCol}${lastRow}`;
      const linkRange = `'${sheetTitle}'!${linkCol}${config.startRow}:${linkCol}${lastRow}`;

      const [payRes, amountRes, linkRes] = await Promise.all([
        sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: payRange }),
        sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: amountRange }),
        sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: linkRange })
      ]);
      const oldPayValues = payRes.data.values || [];
      while (oldPayValues.length < count) oldPayValues.push(['']);
      const oldAmountValues = amountRes.data.values || [];
      const linkValues = linkRes.data.values || [];

      const newPayValues = Array(count).fill([notPaidValue]);
      const { newAmountValues, refilledCount } = refillBlankAmounts(sheetKey, oldAmountValues, linkValues, count);

      await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'unpaid all', range: payRange, oldValues: oldPayValues, newValues: newPayValues });
      if (refilledCount > 0) {
        await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'unpaid all (amount refilled)', range: amountRange, oldValues: oldAmountValues, newValues: newAmountValues });
      }

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: payRange, values: newPayValues },
            { range: amountRange, values: newAmountValues }
          ]
        }
      });
      const suffix = refilledCount > 0 ? ` (${refilledCount} amount${refilledCount === 1 ? '' : 's'} refilled from task rate)` : '';
      return interaction.editReply(`🔄 [${config.label}] All **${count}** rows updated back to **Not Paid**${suffix}!`);
    }

    if (subcommand === 'row') {
      const row = interaction.options.getInteger('number');
      if (row < config.startRow) return interaction.editReply(`⚠️ Row number must be ${config.startRow} or higher.`);
      if (row > lastRow) return interaction.editReply(`⚠️ Row **${row}** doesn't exist (sheet only has data up to row ${lastRow}).`);

      const payRange = `'${sheetTitle}'!${payCol}${row}`;
      const amountRange = `'${sheetTitle}'!${amountCol}${row}`;
      const linkRange = `'${sheetTitle}'!${linkCol}${row}`;

      const [payRes, amountRes, linkRes] = await Promise.all([
        sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: payRange }),
        sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: amountRange }),
        sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: linkRange })
      ]);
      const oldPayValues = payRes.data.values || [];
      const oldAmountValues = amountRes.data.values || [];
      const linkValues = linkRes.data.values || [];

      const { newAmountValues, refilledCount } = refillBlankAmounts(sheetKey, oldAmountValues, linkValues, 1);

      await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'unpaid row', range: payRange, oldValues: oldPayValues, newValues: [[notPaidValue]] });
      if (refilledCount > 0) {
        await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'unpaid row (amount refilled)', range: amountRange, oldValues: oldAmountValues, newValues: newAmountValues });
      }

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: payRange, values: [[notPaidValue]] },
            { range: amountRange, values: newAmountValues }
          ]
        }
      });
      const suffix = refilledCount > 0 ? ' (amount refilled from task rate)' : '';
      return interaction.editReply(`🔄 [${config.label}] Row **${row}** updated back to **Not Paid**${suffix}!`);
    }

    if (subcommand === 'range') {
      const start = interaction.options.getInteger('start');
      const end = interaction.options.getInteger('end');
      if (start < config.startRow) return interaction.editReply(`⚠️ Start row must be ${config.startRow} or higher.`);
      if (end < start) return interaction.editReply('⚠️ End row must be greater than or equal to start row.');
      if (end > lastRow) return interaction.editReply(`⚠️ Row **${end}** doesn't exist (sheet only has data up to row ${lastRow}).`);

      const count = end - start + 1;
      const payRange = `'${sheetTitle}'!${payCol}${start}:${payCol}${end}`;
      const amountRange = `'${sheetTitle}'!${amountCol}${start}:${amountCol}${end}`;
      const linkRange = `'${sheetTitle}'!${linkCol}${start}:${linkCol}${end}`;

      const [payRes, amountRes, linkRes] = await Promise.all([
        sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: payRange }),
        sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: amountRange }),
        sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: linkRange })
      ]);
      const oldPayValues = payRes.data.values || [];
      const oldAmountValues = amountRes.data.values || [];
      const linkValues = linkRes.data.values || [];

      const newPayValues = Array(count).fill([notPaidValue]);
      const { newAmountValues, refilledCount } = refillBlankAmounts(sheetKey, oldAmountValues, linkValues, count);

      await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'unpaid range', range: payRange, oldValues: oldPayValues, newValues: newPayValues });
      if (refilledCount > 0) {
        await logHistory(config.spreadsheetId, { user: interaction.user.tag, command: 'unpaid range (amount refilled)', range: amountRange, oldValues: oldAmountValues, newValues: newAmountValues });
      }

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: payRange, values: newPayValues },
            { range: amountRange, values: newAmountValues }
          ]
        }
      });
      const suffix = refilledCount > 0 ? ` (${refilledCount} amount${refilledCount === 1 ? '' : 's'} refilled from task rate)` : '';
      return interaction.editReply(`🔄 [${config.label}] Rows **${start} to ${end}** updated back to **Not Paid**${suffix}!`);
    }
  }
};