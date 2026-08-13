const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, findLastHistoryEntry, removeHistoryEntry } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('undo')
    .setDescription('Undo the last change made to the sheet')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply();

    const last = await findLastHistoryEntry();
    if (!last) return interaction.editReply('⚠️ No changes available to undo.');

    const [timestamp, user, command, range, oldValuesJson] = last.entry;
    const oldValues = JSON.parse(oldValuesJson || '[]');

    if (oldValues.length === 0) {
      // The range was empty before the change — undo means clearing it again.
      await sheets.spreadsheets.values.clear({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: oldValues }
      });
    }

    await removeHistoryEntry(last.rowIndex);

    return interaction.editReply(
      `↩️ **Undone!**\n📌 **Command:** ${command}\n👤 **By:** ${user}\n🕒 **When:** ${new Date(timestamp).toLocaleString()}`
    );
  }
};
