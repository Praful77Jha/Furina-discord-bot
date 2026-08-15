const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
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

async function getUsdToInrRate() {
  const response = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!response.ok) throw new Error(`Exchange rate request failed with HTTP ${response.status}`);
  const data = await response.json();
  const rate = Number(data?.rates?.INR);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('USD to INR exchange rate was not returned.');
  return rate;
}

// Same unpaid-amount logic as stats.js, just without the date tracking.
async function getUnpaidAmount(sheetKey) {
  const config = SHEET_CONFIGS[sheetKey];
  const sheetTitle = await getSheetTitle(config.spreadsheetId);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `'${sheetTitle}'!A${config.startRow}:${config.lastCol}`
  });
  const rows = response.data.values || [];
  let unpaidAmount = 0;

  if (sheetKey === 'captain') {
    const realRows = rows.filter(row => row[4] && row[4].toString().trim());
    realRows.forEach(row => {
      const amount = parseFloat(row[2] ? row[2].toString().replace('$', '') : 0) || 0;
      const status = row[3] ? row[3].toString().trim() : '';
      if (status === 'Not Paid') unpaidAmount += amount;
    });
  } else {
    const realRows = rows.filter(row => row[0] && row[0].toString().trim());
    const creditsIdx = config.colLetters.credits.charCodeAt(0) - 'A'.charCodeAt(0);
    const payIdx = config.colLetters.pay.charCodeAt(0) - 'A'.charCodeAt(0);
    realRows.forEach(row => {
      const credits = parseFloat(row[creditsIdx] || 0) || 0;
      const status = (row[payIdx] || '').toString().trim().toUpperCase();
      if (status !== 'PAID') unpaidAmount += credits;
    });
  }

  return unpaidAmount;
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
      const sheetKey = resolveSheetKey(interaction.channelId);
      if (!sheetKey) {
        return interaction.editReply('⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.');
      }
      const config = SHEET_CONFIGS[sheetKey];
      if (!config.spreadsheetId) return interaction.editReply(`⚠️ **${config.label}** sheet is not configured.`);

      const appKey = interaction.options.getString('app');
      const app = APPS[appKey];
      const qrPath = path.join(__dirname, '../../assets/qr', app.file);

      if (!fs.existsSync(qrPath)) {
        return interaction.editReply(`⚠️ QR image for **${app.label}** not found at \`assets/qr/${app.file}\`.`);
      }

      const [unpaidAmount, usdToInrRate] = await Promise.all([
        getUnpaidAmount(sheetKey),
        getUsdToInrRate()
      ]);
      const unpaidInr = unpaidAmount * usdToInrRate;

      const attachment = new AttachmentBuilder(qrPath, { name: app.file });

    return interaction.editReply({
        content:
          `🙏 **Dakshina — ${config.label} Sheet**\n` +
          `--------------------\n\n` +
          `💰 **Unpaid Amount:** $${unpaidAmount.toFixed(2)}\n\n` +
          `🇮🇳 **Unpaid in INR:** ₹${unpaidInr.toFixed(2)} (1$ = ₹${usdToInrRate.toFixed(2)})\n\n` +
          `📄 **Sheet:** https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`,
        files: [attachment]
      });
    } catch (error) {
      console.error('Dakshina command error:', error);
      return interaction.editReply('⚠️ Could not load payment info right now. Please try again in a moment.');
    }
  }
};