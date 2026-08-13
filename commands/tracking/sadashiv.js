const { SlashCommandBuilder } = require('discord.js');
const { sheets, getSheetTitle } = require('../../utils/googleSheets');

let tandemBackup = null;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sadashiv')
    .setDescription('Commands of cosmic dissolution and restoration')
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
      const res = await sheets.spreadsheets.values.get({ 
        spreadsheetId: process.env.SPREADSHEET_ID, 
        range: `'${sheetTitle}'!A2:E` 
      });
      const existingData = res.data.values || [];
      if (existingData.length === 0) return interaction.editReply('⚠️ The sheet is already completely empty.');

      tandemBackup = { sheetTitle, data: existingData };
      await sheets.spreadsheets.values.clear({ 
        spreadsheetId: process.env.SPREADSHEET_ID, 
        range: `'${sheetTitle}'!A2:E` 
      });

      return interaction.editReply('🔱 **PRALAYA EXECUTED:** All table data in A2:E has been dissolved into empty space!\n💡 *Use `/sadashiv action:restore (Srishti)` to restore the state.*');
    }

    // Undo Deletion: Srishti (Restoration/Recreation)
    if (action === 'srishti') {
      if (!tandemBackup) return interaction.editReply('❌ **No dissolved data found to restore!** Either no backup exists or the bot restarted.');

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'${tandemBackup.sheetTitle}'!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: tandemBackup.data }
      });

      const count = tandemBackup.data.length;
      tandemBackup = null;

      return interaction.editReply(`🔱 **SRISHTI EXECUTED:** Cosmic order restored! Brought back **${count}** rows!`);
    }
  }
};