const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle, detectTaskDetails } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Log a new task entry')
    .addStringOption(option => option.setName('link').setDescription('The task link').setRequired(true))
    .addNumberOption(option => option.setName('amount').setDescription('Custom amount (optional)')),

  async execute(interaction) {
    await interaction.deferReply();
    const link = interaction.options.getString('link');
    const customAmount = interaction.options.getNumber('amount');
    const sheetTitle = await getSheetTitle();

    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${sheetTitle}'!E:E`
    });

    const rows = existingData.data.values || [];
    const duplicateIndex = rows.findIndex(row => row[0] && row[0].trim() === link.trim());
    if (duplicateIndex !== -1) {
      return interaction.editReply(`⚠️ **Duplicate Link detected!** Already logged on row **${duplicateIndex + 1}**.`);
    }

    const { taskType, amount } = detectTaskDetails(link, customAmount);
    const today = new Date();
    const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${sheetTitle}'!A:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[formattedDate, taskType, amount, 'Not Paid', link]] }
    });

    return interaction.editReply(`✅ **Logged!**\n📅 **Date:** ${formattedDate}\n📝 **Type:** ${taskType}\n💵 **Amount:** $${amount.toFixed(2)}\n🔗 **Link:** ${link}`);
  }
};