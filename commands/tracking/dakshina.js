const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const { sheets, SHEET_CONFIGS, getSheetTitle } = require('../../utils/googleSheets');

const APPS = {
  gpay: { label: 'GPay', file: 'gpay.png', upi: 'kumarjhapraful@okaxis' },
  bhim: { label: 'BHIM', file: 'bhim.png', upi: 'goyim@upi' },
  paytm: { label: 'Paytm', file: 'paytm.png', upi: 'goyim-jha@ptyes' },
  samsung: { label: 'Samsung Wallet', file: 'samsung.png', upi: 'goyim@pingpay' }
};

function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(key => SHEET_CONFIGS[key].channelId === channelId);
}

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

// Fetches unpaid entries with dates for week grouping.
async function getUnpaidEntries(sheetKey) {
  const config = SHEET_CONFIGS[sheetKey];
  const sheetTitle = await getSheetTitle(config.spreadsheetId);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `'${sheetTitle}'!A${config.startRow}:${config.lastCol}`
  });
  const rows = response.data.values || [];
  const entries = [];

  if (sheetKey === 'captain') {
    const realRows = rows.filter(row => row[4] && row[4].toString().trim());
    realRows.forEach(row => {
      const amount = parseFloat(row[2] ? row[2].toString().replace('$', '') : 0) || 0;
      const status = row[3] ? row[3].toString().trim() : '';
      if (status === 'Not Paid') {
        const date = parseTaskDate(row[0]);
        if (date) entries.push({ date, amount });
      }
    });
  } else {
    const realRows = rows.filter(row => row[0] && row[0].toString().trim());
    const creditsIdx = config.colLetters.credits.charCodeAt(0) - 'A'.charCodeAt(0);
    const payIdx = config.colLetters.pay.charCodeAt(0) - 'A'.charCodeAt(0);
    realRows.forEach(row => {
      const credits = parseFloat(row[creditsIdx] || 0) || 0;
      const status = (row[payIdx] || '').toString().trim().toUpperCase();
      if (status !== 'PAID') {
        const date = parseTaskDate(row[1]);
        if (date) entries.push({ date, amount: credits });
      }
    });
  }

  return entries;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dakshina')
    .setDescription('Get the payment QR + UPI ID + unpaid amount for this channel\'s sheet')
    .addStringOption(option => option.setName('app').setDescription('Which app\'s QR code').setRequired(true)
      .addChoices(
        { name: 'GPay', value: 'gpay' },
        { name: 'BHIM', value: 'bhim' },
        { name: 'Paytm', value: 'paytm' },
        { name: 'Samsung Wallet', value: 'samsung' }
      )),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      let sheetKey = resolveSheetKey(interaction.channelId);
      if (!sheetKey) {
        return interaction.editReply('⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.');
      }

      // Use celebiCopy instead of celebi for dakshina
      if (sheetKey === 'celebi') {
        sheetKey = 'celebiCopy';
      }

      const config = SHEET_CONFIGS[sheetKey];
      if (!config.spreadsheetId) return interaction.editReply(`⚠️ **${config.label}** sheet is not configured.`);

      const appKey = interaction.options.getString('app');
      const app = APPS[appKey];
      const qrPath = path.join(__dirname, '../../assets/qr', app.file);

      if (!fs.existsSync(qrPath)) {
        return interaction.editReply(`⚠️ QR image for **${app.label}** not found at \`assets/qr/${app.file}\`.`);
      }

      const [unpaidEntries, usdToInrRate] = await Promise.all([
        getUnpaidEntries(sheetKey),
        getUsdToInrRate()
      ]);

      const weekStartDay = sheetKey === 'captain' ? 1 : 0; // Monday / Sunday
      const weeks = groupByWeeks(unpaidEntries, weekStartDay);

      if (weeks.length === 0) {
        return interaction.editReply('✅ No unpaid entries found!');
      }

      const maxWeeks = Math.min(weeks.length, 4);

      // Build dropdown options: "1 Week", "2 Weeks", ... up to available weeks
      const options = [];
      for (let i = 1; i <= maxWeeks; i++) {
        let totalAmount = 0;
        for (let w = 0; w < i; w++) {
          totalAmount += weeks[w].amount;
        }
        const totalInr = totalAmount * usdToInrRate;
        options.push({
          label: `${i} Week${i > 1 ? 's' : ''}`,
          description: `$${totalAmount.toFixed(2)} / ₹${totalInr.toFixed(2)}`,
          value: String(i),
        });
      }

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`dakshina_weeks_${interaction.user.id}`)
          .setPlaceholder('Select weeks to pay')
          .addOptions(options)
      );

      const weekBreakdown = weeks.slice(0, maxWeeks).map(w => {
        const wInr = w.amount * usdToInrRate;
        return `📅 **Week ${w.week}** (${w.label}): ${w.count} entries, $${w.amount.toFixed(2)}`;
      }).join('\n');

      await interaction.editReply({
        content:
          `🙏 **Payment — ${config.label} Sheet**\n` +
          `--------------------\n\n` +
          weekBreakdown + '\n\n' +
          `--------------------\n` +
          `Select weeks to pay:`,
        components: [selectRow],
      });

      try {
        const selection = await interaction.channel.awaitMessageComponent({
          filter: i =>
            i.customId === `dakshina_weeks_${interaction.user.id}` &&
            i.user.id === interaction.user.id,
          time: 60_000,
        });

        await selection.deferUpdate();

        const selectedWeeks = parseInt(selection.values[0], 10);

        let totalAmount = 0;
        let totalEntries = 0;
        for (let w = 0; w < selectedWeeks; w++) {
          totalAmount += weeks[w].amount;
          totalEntries += weeks[w].count;
        }
        const totalInr = totalAmount * usdToInrRate;

        const selectedBreakdown = weeks.slice(0, selectedWeeks).map(w => {
          const wInr = w.amount * usdToInrRate;
          return (
            `📅 **Week ${w.week}** (${w.label})\n` +
            `   🔢 Entries: ${w.count} | 💰 $${w.amount.toFixed(2)} | 🇮🇳 ₹${wInr.toFixed(2)}`
          );
        }).join('\n');

        const attachment = new AttachmentBuilder(qrPath, { name: app.file });

        await interaction.editReply({
          content:
            `🙏 **Payment — ${config.label} Sheet**\n` +
            `====================\n\n` +
            selectedBreakdown + '\n\n' +
            `====================\n\n` +
            `🔢 **Total Entries:** ${totalEntries}\n` +
            `💰 **Total Amount:** $${totalAmount.toFixed(2)}\n` +
            `🇮🇳 **Total in INR:** ₹${totalInr.toFixed(2)} (1$ = ₹${usdToInrRate.toFixed(2)})\n\n` +
            `📄 **Sheet:** https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`,
          components: [],
          files: [attachment],
        });
      } catch {
        await interaction.editReply({
          content: '⏰ Selection timed out. Please try again.',
          components: [],
        });
      }
    } catch (error) {
      console.error('Dakshina command error:', error);
      return interaction.editReply('⚠️ Could not load payment info right now. Please try again in a moment.');
    }
  }
};
