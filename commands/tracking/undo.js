const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { sheets, SHEET_CONFIGS, findLastHistoryEntry, removeHistoryEntry } = require('../../utils/googleSheets');

function resolveSheetKey(channelId) {
  return Object.keys(SHEET_CONFIGS).find(key => SHEET_CONFIGS[key].channelId === channelId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('undo')
    .setDescription('Undo the last change made to the sheet for this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply();

    const sheetKey = resolveSheetKey(interaction.channelId);

    if (!sheetKey) {
      return interaction.editReply('⚠️ This channel isn\'t linked to a sheet. Use this command in **#captain-sheet** or **#celebi-sheet**.');
    }

    // Captain — direct undo, no dropdown
    if (sheetKey === 'captain') {
      const config = SHEET_CONFIGS.captain;
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

    // Celebi — show dropdown to pick sheet
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`undo_sheet_${interaction.user.id}`)
        .setPlaceholder('Select sheet to undo')
        .addOptions([
          { label: 'DOOMED SHEET', value: 'celebi', description: 'Original celebi sheet' },
          { label: 'copy of DOOMED SHEET', value: 'celebiCopy', description: 'Celebi copy sheet' },
        ])
    );

    await interaction.editReply({
      content: '📋 **Which sheet do you want to undo from?**',
      components: [selectRow],
    });

    try {
      const selection = await interaction.channel.awaitMessageComponent({
        filter: i =>
          i.customId === `undo_sheet_${interaction.user.id}` &&
          i.user.id === interaction.user.id,
        time: 60_000,
      });

      await selection.deferUpdate();

      const selectedKey = selection.values[0];
      const config = SHEET_CONFIGS[selectedKey];

      const last = await findLastHistoryEntry(config.spreadsheetId);
      if (!last) {
        return interaction.editReply({
          content: `⚠️ No changes available to undo on **${config.label}**.`,
          components: [],
        });
      }

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

      await interaction.editReply({
        content:
          `↩️ **Undone [${config.label}]!**\n` +
          `📌 **Command:** ${command}\n` +
          `👤 **By:** ${user}\n` +
          `🕒 **When:** ${new Date(timestamp).toLocaleString()}`,
        components: [],
      });
    } catch {
      try {
        await interaction.editReply({
          content: '⏰ Selection timed out. Please try again.',
          components: [],
        });
      } catch {
        // interaction fully expired
      }
    }
  }
};
