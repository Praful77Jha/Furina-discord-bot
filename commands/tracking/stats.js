const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View sheet overview and total balance'),

  async execute(interaction) {
    await interaction.deferReply();
    const sheetTitle = await getSheetTitle();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${sheetTitle}'!A2:E`
    });

    const rows = response.data.values || [];
    let totalAmount = 0, unpaidAmount = 0, paidCount = 0, unpaidCount = 0;

    rows.forEach(row => {
      const amt = parseFloat(row[2] ? row[2].toString().replace('$', '') : 0) || 0;
      const status = row[3] ? row[3].trim() : '';

      totalAmount += amt;
      if (status === 'Paid') paidCount++;
      else if (status === 'Not Paid') { unpaidAmount += amt; unpaidCount++; }
    });

    return interaction.editReply(
      `📊 **Sheet Overview**\n--------------------\n🔢 **Total Entries:** ${rows.length}\n💵 **Total Earnings:** $${totalAmount.toFixed(2)}\n⏳ **Unpaid Amount:** $${unpaidAmount.toFixed(2)} (${unpaidCount} tasks)\n✅ **Paid Count:** ${paidCount} tasks`
    );
  }
};