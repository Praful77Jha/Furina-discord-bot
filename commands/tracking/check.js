const { SlashCommandBuilder } = require('discord.js');
const { sheets, SHEET_CONFIGS, getSheetTitle } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check if a link exists in the selected spreadsheet')
    .addStringOption(option => option.setName('sheet').setDescription('Target sheet').setRequired(true)
      .addChoices({ name: 'Captain', value: 'captain' }, { name: 'Celebi', value: 'celebi' }))
    .addStringOption(option => option.setName('link').setDescription('The link to search for').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const sheetKey = interaction.options.getString('sheet');
    const config = SHEET_CONFIGS[sheetKey];
    if (!config.spreadsheetId) return interaction.editReply(`⚠️ **${config.label}** sheet is not configured.`);

    const targetLink = interaction.options.getString('link').trim();
    const sheetTitle = await getSheetTitle(config.spreadsheetId);

    const linkCol = config.colLetters.link;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `'${sheetTitle}'!A${config.startRow}:${config.lastCol}`
    });

    const rows = response.data.values || [];
    const linkIdx = linkCol.charCodeAt(0) - 'A'.charCodeAt(0);

    const foundIndex = rows.findIndex(r => r[linkIdx] && r[linkIdx].trim() === targetLink);

    if (foundIndex !== -1) {
      const found = rows[foundIndex];
      const actualRow = foundIndex + config.startRow;

      if (sheetKey === 'captain') {
        return interaction.editReply(
          `🔍 [${config.label}] **Found at Row ${actualRow}!**\n📅 **Date:** ${found[0] || 'N/A'}\n📝 **Type:** ${found[1] || 'N/A'}\n💵 **Amount:** $${found[2] || '0'}\n📌 **Status:** ${found[3] || 'N/A'}`
        );
      } else {
        return interaction.editReply(
          `🔍 [${config.label}] **Found at Row ${actualRow}!**\n🏷️ **Provider:** ${found[0] || 'N/A'}\n📅 **Date:** ${found[1] || 'N/A'}\n👤 **Account:** ${found[3] || 'N/A'}\n📝 **Type:** ${found[4] || 'N/A'}\n💳 **Credits:** ${found[5] || '0'}\n📌 **Status:** ${found[6] || 'N/A'}`
        );
      }
    }

    return interaction.editReply(`❌ **Link not found** in **${config.label}** spreadsheet.`);
  }
};