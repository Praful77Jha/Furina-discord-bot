const { SlashCommandBuilder } = require('discord.js');
const { sheets, SHEET_CONFIGS, getSheetTitle } = require('../../utils/googleSheets');

function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(key => SHEET_CONFIGS[key].channelId === channelId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View sheet overview and metrics for this channel'),

  async execute(interaction) {
    await interaction.deferReply();

    const sheetKey = resolveSheetKey(interaction.channelId);
    if (!sheetKey) {
      return interaction.editReply('⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.');
    }
    const config = SHEET_CONFIGS[sheetKey];
    if (!config.spreadsheetId) return interaction.editReply(`⚠️ **${config.label}** sheet is not configured.`);

    const sheetTitle = await getSheetTitle(config.spreadsheetId);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `'${sheetTitle}'!A${config.startRow}:${config.lastCol}`
    });

    const rows = response.data.values || [];

    if (sheetKey === 'captain') {
      let totalAmount = 0, unpaidAmount = 0, paidCount = 0, unpaidCount = 0;

      rows.forEach(row => {
        const amt = parseFloat(row[2] ? row[2].toString().replace('$', '') : 0) || 0;
        const status = row[3] ? row[3].trim() : '';

        totalAmount += amt;
        if (status === 'Paid') paidCount++;
        else if (status === 'Not Paid') { unpaidAmount += amt; unpaidCount++; }
      });

      return interaction.editReply(
        `📊 **Captain Sheet Overview**\n--------------------\n🔢 **Total Entries:** ${rows.length}\n💵 **Total Earnings:** $${totalAmount.toFixed(2)}\n⏳ **Unpaid Amount:** $${unpaidAmount.toFixed(2)} (${unpaidCount} tasks)\n✅ **Paid Count:** ${paidCount} tasks`
      );
    } else {
      let totalCredits = 0, paidCredits = 0, unpaidCredits = 0, paidCount = 0, unpaidCount = 0;

      const creditsIdx = config.colLetters.credits.charCodeAt(0) - 'A'.charCodeAt(0);
      const payIdx = config.colLetters.pay.charCodeAt(0) - 'A'.charCodeAt(0);

      rows.forEach(row => {
        const credits = parseFloat(row[creditsIdx] || 0) || 0;
        const status = (row[payIdx] || '').trim().toUpperCase();

        totalCredits += credits;
        if (status === 'PAID') {
          paidCredits += credits;
          paidCount++;
        } else {
          unpaidCredits += credits;
          unpaidCount++;
        }
      });

      return interaction.editReply(
        `📊 **Celebi Sheet Overview**\n--------------------\n🔢 **Total Entries:** ${rows.length}\n💳 **Total Credits:** ${totalCredits.toFixed(1)}\n⏳ **Unpaid Credits:** ${unpaidCredits.toFixed(1)} (${unpaidCount} tasks)\n✅ **Paid Credits:** ${paidCredits.toFixed(1)} (${paidCount} tasks)`
      );
    }
  }
};