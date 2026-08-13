const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check if a link exists in the spreadsheet')
    .addStringOption(option => option.setName('link').setDescription('The link to search for').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const targetLink = interaction.options.getString('link').trim();
    const sheetTitle = await getSheetTitle();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'${sheetTitle}'!A2:E`
    });

    const rows = response.data.values || [];
    const foundIndex = rows.findIndex(r => r[4] && r[4].trim() === targetLink);

    if (foundIndex !== -1) {
      const found = rows[foundIndex];
      return interaction.editReply(`🔍 **Found at Row ${foundIndex + 2}!**\n📅 **Date:** ${found[0]}\n📝 **Type:** ${found[1]}\n💵 **Amount:** $${found[2]}\n📌 **Status:** ${found[3]}`);
    }
    return interaction.editReply('❌ **Link not found** in spreadsheet.');
  }
};