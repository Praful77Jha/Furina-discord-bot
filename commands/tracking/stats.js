const { SlashCommandBuilder } = require('discord.js');
const { sheets, SHEET_CONFIGS, getSheetTitle } = require('../../utils/googleSheets');

function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(key => SHEET_CONFIGS[key].channelId === channelId);
}

// Reads the live USD->INR rate from cell H1 on the Captain sheet
// (=GOOGLEFINANCE("CURRENCY:USDINR")), used for every sheet's stats.
async function getUsdToInrRate() {
  const sheetTitle = await getSheetTitle(SHEET_CONFIGS.captain.spreadsheetId);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_CONFIGS.captain.spreadsheetId,
    range: `'${sheetTitle}'!H1`
  });

  const rate = Number(response.data.values?.[0]?.[0]);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('USD to INR exchange rate cell (H1) is empty or invalid.');
  }

  return rate;
}

// Dates are stored as "M/D/YYYY" strings (see log.js). Returns a Date or null.
function parseTaskDate(str) {
  if (!str) return null;
  const parts = str.toString().trim().split('/');
  if (parts.length !== 3) return null;
  const [month, day, year] = parts.map(n => parseInt(n, 10));
  if (!month || !day || !year) return null;
  const d = new Date(year, month - 1, day);
  return isNaN(d.getTime()) ? null : d;
}

// Number of distinct calendar days that have at least one unpaid task.
function distinctDayCount(dates) {
  if (dates.length === 0) return null;
  const uniqueDays = new Set(dates.map(d => d.toDateString()));
  return uniqueDays.size;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View sheet overview and metrics for this channel'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const sheetKey = resolveSheetKey(interaction.channelId);

      if (!sheetKey) {
        return interaction.editReply(
          '⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.'
        );
      }

      const config = SHEET_CONFIGS[sheetKey];

      if (!config.spreadsheetId) {
        return interaction.editReply(
          `⚠️ **${config.label}** sheet is not configured.`
        );
      }

      const sheetTitle = await getSheetTitle(config.spreadsheetId);

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `'${sheetTitle}'!A${config.startRow}:${config.lastCol}`
      });

      const rows = response.data.values || [];
      const usdToInrRate = await getUsdToInrRate();

      // =========================
      // CAPTAIN
      // =========================
      if (sheetKey === 'captain') {

        // Column E = Link.
        // A row is considered a real task only when the link exists.
        const realRows = rows.filter(
          row => row[4] && row[4].toString().trim()
        );

        let unpaidAmount = 0;
        let unpaidCount = 0;
        const unpaidDates = [];

        realRows.forEach(row => {
          const amount =
            parseFloat(
              row[2]
                ? row[2].toString().replace('$', '')
                : 0
            ) || 0;

          const status = row[3]
            ? row[3].toString().trim()
            : '';

          if (status === 'Not Paid') {
            unpaidAmount += amount;
            unpaidCount++;
            const date = parseTaskDate(row[0]); // Column A = Date
            if (date) unpaidDates.push(date);
          }
        });

        const unpaidInr = unpaidAmount * usdToInrRate;
        const span = distinctDayCount(unpaidDates);
        const spanText = span === null ? 'N/A' : `${span} day${span === 1 ? '' : 's'}`;

        return interaction.editReply(
          `📊 **Captain Sheet Overview**\n` +
          `--------------------\n` +
          `🔢 **Total Entries:** ${realRows.length}\n` +
          `💰 **Unpaid Amount:** $${unpaidAmount.toFixed(2)} (${unpaidCount} tasks)\n` +
          `🇮🇳 **Unpaid in INR:** ₹${unpaidInr.toFixed(2)} (1$ = ₹${usdToInrRate.toFixed(2)})\n` +
          `📅 **Total Days:** ${spanText}`
        );
      }

      // =========================
      // CELEBI
      // =========================

      // Column A = Provider.
      // A row is considered a real task only when Provider exists.
      // This prevents leftover template LIVE rows from being counted.
      const realRows = rows.filter(
        row => row[0] && row[0].toString().trim()
      );

      const creditsIdx =
        config.colLetters.credits.charCodeAt(0) -
        'A'.charCodeAt(0);

      const payIdx =
        config.colLetters.pay.charCodeAt(0) -
        'A'.charCodeAt(0);

      let unpaidCredits = 0;
      let unpaidCount = 0;
      const unpaidDates = [];

      realRows.forEach(row => {
        const credits =
          parseFloat(row[creditsIdx] || 0) || 0;

        const status =
          (row[payIdx] || '')
            .toString()
            .trim()
            .toUpperCase();

        if (status !== 'PAID') {
          unpaidCredits += credits;
          unpaidCount++;
          const date = parseTaskDate(row[1]); // Column B = Date
          if (date) unpaidDates.push(date);
        }
      });

      const unpaidInr = unpaidCredits * usdToInrRate;
      const span = distinctDayCount(unpaidDates);
      const spanText = span === null ? 'N/A' : `${span} day${span === 1 ? '' : 's'}`;

      return interaction.editReply(
        `📊 **Celebi Sheet Overview**\n` +
        `--------------------\n` +
        `🔢 **Total Entries:** ${realRows.length}\n` +
        `💰 **Unpaid Credits:** $${unpaidCredits.toFixed(2)} (${unpaidCount} tasks)\n` +
        `🇮🇳 **Unpaid in INR:** ₹${unpaidInr.toFixed(2)} (1$ = ₹${usdToInrRate.toFixed(2)})\n` +
        `📅 **Total Days:** ${spanText}`
      );

    } catch (error) {
      console.error('Stats command error:', error);

      return interaction.editReply(
        '⚠️ Could not load the stats right now. Please try again in a moment.'
      );
    }
  }
};