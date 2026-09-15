const { SlashCommandBuilder } = require('discord.js');
const { sheets, SHEET_CONFIGS, getSheetTitle } = require('../../utils/googleSheets');

// Reads the live USD->INR rate from cell H1 on the Captain sheet
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

// Dates are stored as "M/D/YYYY" strings. Returns a Date or null.
function parseTaskDate(str) {
  if (!str) return null;
  const parts = str.toString().trim().split('/');
  if (parts.length !== 3) return null;
  const [month, day, year] = parts.map(n => parseInt(n, 10));
  if (!month || !day || !year) return null;
  const d = new Date(year, month - 1, day);
  return isNaN(d.getTime()) ? null : d;
}

// Gets the start date of the calendar week containing `date`.
// startDay: 0 = Sunday, 1 = Monday
function getWeekStartDate(date, startDay) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - startDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Formats "Sep 6 – Sep 12" from a week start date.
function formatWeekRange(weekStart) {
  const opts = { month: 'short', day: 'numeric' };
  const start = weekStart.toLocaleDateString('en-US', opts);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const endStr = end.toLocaleDateString('en-US', opts);
  return `${start} – ${endStr}`;
}

// Groups entries by real calendar weeks.
// weekStartDay: 0 = Sunday (Celebi), 1 = Monday (Captain)
function groupByWeeks(entries, weekStartDay) {
  if (entries.length === 0) return [];

  const weekMap = {};
  for (const entry of entries) {
    if (!entry.date) continue;
    const weekStart = getWeekStartDate(entry.date, weekStartDay);
    const key = weekStart.toISOString();

    if (!weekMap[key]) {
      weekMap[key] = { weekStart, count: 0, amount: 0 };
    }
    weekMap[key].count++;
    weekMap[key].amount += entry.amount;
  }

  const sorted = Object.values(weekMap).sort(
    (a, b) => a.weekStart - b.weekStart
  );

  return sorted.map((w, i) => ({
    week: i + 1,
    label: formatWeekRange(w.weekStart),
    count: w.count,
    amount: w.amount,
  }));
}

// Fetches one sheet's unpaid stats with entries for week grouping.
async function getSheetUnpaidStats(sheetKey) {
  const config = SHEET_CONFIGS[sheetKey];
  if (!config.spreadsheetId) return { entryCount: 0, unpaidCount: 0, unpaidAmount: 0, unpaidEntries: [] };

  const sheetTitle = await getSheetTitle(config.spreadsheetId);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `'${sheetTitle}'!A${config.startRow}:${config.lastCol}`
  });
  const rows = response.data.values || [];

  let realRows, unpaidAmount = 0, unpaidCount = 0;
  const unpaidEntries = [];

  if (sheetKey === 'captain') {
    realRows = rows.filter(row => row[4] && row[4].toString().trim());
    realRows.forEach(row => {
      const amount = parseFloat(row[2] ? row[2].toString().replace('$', '') : 0) || 0;
      const status = row[3] ? row[3].toString().trim() : '';
      if (status === 'Not Paid') {
        unpaidAmount += amount;
        unpaidCount++;
        const date = parseTaskDate(row[0]);
        if (date) unpaidEntries.push({ date, amount });
      }
    });
  } else {
    realRows = rows.filter(row => row[0] && row[0].toString().trim());
    const creditsIdx = config.colLetters.credits.charCodeAt(0) - 'A'.charCodeAt(0);
    const payIdx = config.colLetters.pay.charCodeAt(0) - 'A'.charCodeAt(0);
    realRows.forEach(row => {
      const credits = parseFloat(row[creditsIdx] || 0) || 0;
      const status = (row[payIdx] || '').toString().trim().toUpperCase();
      if (status !== 'PAID') {
        unpaidAmount += credits;
        unpaidCount++;
        const date = parseTaskDate(row[1]);
        if (date) unpaidEntries.push({ date, amount: credits });
      }
    });
  }

  return { entryCount: realRows.length, unpaidCount, unpaidAmount, unpaidEntries };
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
        getSheetUnpaidStats('celebiCopy')
      ]);
      const usdToInrRate = await getUsdToInrRate();

      const totalUnpaidEntries = captain.unpaidCount + celebi.unpaidCount;
      const totalUnpaid = captain.unpaidAmount + celebi.unpaidAmount;
      const totalUnpaidInr = totalUnpaid * usdToInrRate;

      const captainWeeks = groupByWeeks(captain.unpaidEntries, 1); // Monday start
      const celebiWeeks = groupByWeeks(celebi.unpaidEntries, 0);   // Sunday start

      const captainWeekBlocks = captainWeeks.map(w => {
        const wInr = w.amount * usdToInrRate;
        return (
          `📅 **Week ${w.week}** (${w.label})\n` +
          `🔢 **Unpaid Entries:** ${w.count}\n` +
          `💰 **Unpaid Amount:** $${w.amount.toFixed(2)}\n` +
          `🇮🇳 **Unpaid in INR:** ₹${wInr.toFixed(2)}`
        );
      }).join('\n\n');

      const celebiWeekBlocks = celebiWeeks.map(w => {
        const wInr = w.amount * usdToInrRate;
        return (
          `📅 **Week ${w.week}** (${w.label})\n` +
          `🔢 **Unpaid Entries:** ${w.count}\n` +
          `💰 **Unpaid Credits:** $${w.amount.toFixed(2)}\n` +
          `🇮🇳 **Unpaid in INR:** ₹${wInr.toFixed(2)}`
        );
      }).join('\n\n');

      return interaction.editReply(
        `📊 **All Sheets Overview**\n` +
        `====================\n` +
        `🔢 **Total Unpaid Entries:** ${totalUnpaidEntries} (Captain: ${captain.unpaidCount}, Celebi: ${celebi.unpaidCount})\n` +
        `💰 **Total Unpaid:** $${totalUnpaid.toFixed(2)}\n` +
        `🇮🇳 **Total Unpaid in INR:** ₹${totalUnpaidInr.toFixed(2)} (1$ = ₹${usdToInrRate.toFixed(2)})\n` +
        `====================\n\n` +
        `🟦 **Captain Sheet** (Monday start)\n` +
        `--------------------\n` +
        (captainWeekBlocks || '📅 No unpaid entries') +
        `\n\n` +
        `🟪 **Celebi Sheet** (Sunday start)\n` +
        `--------------------\n` +
        (celebiWeekBlocks || '📅 No unpaid entries')
      );
    } catch (error) {
      console.error('Allstats command error:', error);
      return interaction.editReply('⚠️ Could not load combined stats right now. Please try again in a moment.');
    }
  }
};
