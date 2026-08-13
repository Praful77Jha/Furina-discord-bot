const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, getSheetTitle, logHistory, findLastHistoryEntry, removeHistoryEntry } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sadashiv')
    .setDescription('Commands of cosmic dissolution and restoration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Choose the act to perform')
        .setRequired(true)
        .addChoices(
          { name: 'destroy (Pralaya) - Wipe table A2:E with backup', value: 'pralaya' },
          { name: 'restore (Srishti) - Recreate wiped table data', value: 'srishti' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const action = interaction.options.getString('action');
    const sheetTitle = await getSheetTitle();

    // Deletion: Pralaya (Dissolution)
    if (action === 'pralaya') {
      const range = `'${sheetTitle}'!A2:E`;
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range
      });
      const existingData = res.data.values || [];
      if (existingData.length === 0) return interaction.editReply('⚠️ The sheet is already completely empty.');

      // Logged to the persistent _History tab, not an in-memory variable —
      // survives bot restarts (Render sleep won't wipe it).
      await logHistory({
        user: interaction.user.tag,
        command: 'sadashiv pralaya',
        range,
        oldValues: existingData,
        newValues: []
      });

      await sheets.spreadsheets.values.clear({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range
      });

      return interaction.editReply('🔱 **PRALAYA EXECUTED:** All table data in A2:E has been dissolved into empty space!\n💡 *Use `/sadashiv action:restore (Srishti)` to restore the state.*');
    }

    // Undo Deletion: Srishti (Restoration/Recreation)
    if (action === 'srishti') {
      const last = await findLastHistoryEntry('sadashiv pralaya');
      if (!last) return interaction.editReply('❌ **No dissolved data found to restore!**');

      const [, , , range, oldValuesJson] = last.entry;
      const oldValues = JSON.parse(oldValuesJson || '[]');

      // Clear first — protects against leftover rows if data was logged
      // after the wipe but before this restore.
      await sheets.spreadsheets.values.clear({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: oldValues }
      });

      await removeHistoryEntry(last.rowIndex);

      return interaction.editReply(`🔱 **SRISHTI EXECUTED:** Cosmic order restored! Brought back **${oldValues.length}** rows!`);
    }
  }
};
