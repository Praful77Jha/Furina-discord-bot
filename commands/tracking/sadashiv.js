const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sheets, SHEET_CONFIGS, getSheetTitle, logHistory, findLastHistoryEntry, removeHistoryEntry } = require('../../utils/googleSheets');

function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(key => SHEET_CONFIGS[key].channelId === channelId);
}

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
          { name: 'destroy (Pralaya) - Wipe table data with backup', value: 'pralaya' },
          { name: 'restore (Srishti) - Recreate wiped table data', value: 'srishti' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const sheetKey = resolveSheetKey(interaction.channelId);
    if (!sheetKey) {
      return interaction.editReply('⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.');
    }
    const config = SHEET_CONFIGS[sheetKey];
    if (!config.spreadsheetId) return interaction.editReply(`⚠️ **${config.label}** sheet is not configured.`);

    const action = interaction.options.getString('action');
    const sheetTitle = await getSheetTitle(config.spreadsheetId);

    // Deletion: Pralaya (Dissolution)
    if (action === 'pralaya') {
      const range = `'${sheetTitle}'!A${config.startRow}:${config.lastCol}`;
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range
      });
      const existingData = res.data.values || [];
      if (existingData.length === 0) return interaction.editReply(`⚠️ **${config.label}** is already completely empty.`);

      await logHistory(config.spreadsheetId, {
        user: interaction.user.tag,
        command: `sadashiv pralaya (${sheetKey})`,
        range,
        oldValues: existingData,
        newValues: []
      });

      await sheets.spreadsheets.values.clear({
        spreadsheetId: config.spreadsheetId,
        range
      });

      return interaction.editReply(`🔱 **PRALAYA EXECUTED [${config.label}]:** All table data starting from row ${config.startRow} has been dissolved into empty space!\n💡 *Use \`/sadashiv action:restore (Srishti)\` in this same channel to restore.*`);
    }

    // Undo Deletion: Srishti (Restoration/Recreation)
    if (action === 'srishti') {
      const last = await findLastHistoryEntry(config.spreadsheetId, `sadashiv pralaya (${sheetKey})`);
      if (!last) return interaction.editReply(`❌ **No dissolved data found to restore for ${config.label}!**`);

      const [, , , range, oldValuesJson] = last.entry;
      const oldValues = JSON.parse(oldValuesJson || '[]');

      await sheets.spreadsheets.values.clear({
        spreadsheetId: config.spreadsheetId,
        range
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: oldValues }
      });

      await removeHistoryEntry(config.spreadsheetId, last.rowIndex);

      return interaction.editReply(`🔱 **SRISHTI EXECUTED [${config.label}]:** Cosmic order restored! Brought back **${oldValues.length}** rows!`);
    }
  }
};