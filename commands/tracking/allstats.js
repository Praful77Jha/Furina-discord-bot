const { SlashCommandBuilder } = require('discord.js');
const { sheets, SHEET_CONFIGS, getSheetTitle } = require('../../utils/googleSheets');

async function getUsdToInrRate() {
  const response = await fetch('https://open.er-api.com/v6/latest/USD');

  if (!response.ok) {
    throw new Error(`Exchange rate request failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  const rate = Number(data?.rates?.INR);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('USD to INR exchange rate was not returned.');
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

// Fetches one sheet's real rows and returns { entryCount, unpaidAmount, unpaidDates }.
// unpaidAmount is always in USD (Celebi credits treated as $1 = 1 credit).
async function getSheetUnpaidStats(sheetKey) {
  const config = SHEET_CONFIGS[sheetKey];
  if (!config.spreadsheetId) return { entryCount: 0, unpaidAmount: 0, unpaidDates: [] };

  const sheetTitle = await getSheetTitle(config.spreadsheetId);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `'${sheetTitle}'!A${config.startRow}:${config.lastCol}`
  });
  const rows = response.data.values || [];

  let realRows, unpaidAmount = 0;
  const unpaidDates = [];

  if (sheetKey === 'captain') {
    realRows = rows.filter(row => row[4] && row[4].toString().trim()); // Link
    realRows.forEach(row => {
      const amount = parseFloat(row[2] ? row[2].toString().replace('$', '') : 0) || 0;
      const status = row[3] ? row[3].toString().trim() : '';
      if (status === 'Not Paid') {
        unpaidAmount += amount;
        const date = parseTaskDate(row[0]); // Date
        if (date) unpaidDates.push(date);
      }
    });
  } else {
    realRows = rows.filter(row => row[0] && row[0].toString().trim()); // Provider
    const creditsIdx = config.colLetters.credits.charCodeAt(0) - 'A'.charCodeAt(0);
    const payIdx = config.colLetters.pay.charCodeAt(0) - 'A'.charCodeAt(0);
    realRows.forEach(row => {
      const credits = parseFloat(row[creditsIdx] || 0) || 0;
      const status = (row[payIdx] || '').toString().trim().toUpperCase();
      if (status !== 'PAID') {
        unpaidAmount += credits;
        const date = parseTaskDate(row[1]); // Date
        if (date) unpaidDates.push(date);
      }
    });
  }

  return { entryCount: realRows.length, unpaidAmount, unpaidDates };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('allstats')
    .setDescription('Combined Captain + Celebi overview'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const [captain, celebi] = await Promise.all([
        getSheetUnpaidStats('captain'),
        getSheetUnpaidStats('celebi')
      ]);
      const usdToInrRate = await getUsdToInrRate();

      const totalEntries = captain.entryCount + celebi.entryCount;
      const totalUnpaid = captain.unpaidAmount + celebi.unpaidAmount;
      const totalUnpaidInr = totalUnpaid * usdToInrRate;
      const allUnpaidDates = [...captain.unpaidDates, ...celebi.unpaidDates];

      const overallSpan = distinctDayCount(allUnpaidDates);
      const captainSpan = distinctDayCount(captain.unpaidDates);
      const celebiSpan = distinctDayCount(celebi.unpaidDates);
      const fmtSpan = (span) => span === null ? 'N/A' : `${span} day${span === 1 ? '' : 's'}`;

      return interaction.editReply(
        `📊 **All Sheets Overview**\n` +
        `--------------------\n` +
        `🔢 **Total Entries:** ${totalEntries} (Captain: ${captain.entryCount}, Celebi: ${celebi.entryCount})\n` +
        `💰 **Total Unpaid:** $${totalUnpaid.toFixed(2)}\n` +
        `🇮🇳 **Total Unpaid in INR:** ₹${totalUnpaidInr.toFixed(2)} (1$ = ₹${usdToInrRate.toFixed(2)})\n` +
        `📅 **Total Days:** ${fmtSpan(overallSpan)} (Captain: ${fmtSpan(captainSpan)}, Celebi: ${fmtSpan(celebiSpan)})`
      );
    } catch (error) {
      console.error('Allstats command error:', error);
      return interaction.editReply('⚠️ Could not load combined stats right now. Please try again in a moment.');
    }
  }
};