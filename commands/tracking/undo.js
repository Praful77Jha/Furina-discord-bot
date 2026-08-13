const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, SHEET_CONFIGS, findLastHistoryEntry, removeHistoryEntry } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('undo')
    .setDescription('Undo the last change made to the sheet')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option => option.setName('sheet').setDescription('Target sheet').setRequired(true)
      .addChoices({ name: 'Captain', value: 'captain' }, { name: 'Celebi', value: 'celebi' })),

  async execute(interaction) {
    await interaction.deferReply();
    const sheetKey = interaction.options.getString('sheet');
    const config = SHEET_CONFIGS[sheetKey];
    if (!config.spreadsheetId) return interaction.editReply(`⚠️ **${config.label}** sheet is not configured.`);

    const last = await findLastHistoryEntry(config.spreadsheetId);
    if (!last) return interaction.editReply(`⚠️ No changes available to undo on **${config.label}**.`);

    const [timestamp, user, command, range, oldValuesJson] = last.entry;
    const oldValues = JSON.parse(oldValuesJson || '[]');

    if (oldValues.length === 0) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: config.spreadsheetId,
        range
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: oldValues }
      });
    }

    await removeHistoryEntry(config.spreadsheetId, last.rowIndex);

    return interaction.editReply(
      `↩️ **Undone [${config.label}]!**\n📌 **Command:** ${command}\n👤 **By:** ${user}\n🕒 **When:** ${new Date(timestamp).toLocaleString()}`
    );
  }
};