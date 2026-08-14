const { SlashCommandBuilder } = require('discord.js');
const { sheets, SHEET_CONFIGS, checkChannel, getSheetTitle, getLastDataRow, detectTaskDetails, detectCelebiTaskDetails, logHistory } = require('../../utils/googleSheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Log a new task entry')
    .addStringOption(option => option.setName('link').setDescription('The task link').setRequired(true))
    .addStringOption(option => option.setName('sheet').setDescription('Target sheet').setRequired(true)
      .addChoices({ name: 'Captain', value: 'captain' }, { name: 'Celebi', value: 'celebi' }))
    .addStringOption(option => option.setName('provider').setDescription('Task provider (Celebi only)')
      .addChoices({ name: 'ELECTRO/FERALIGATOR', value: 'ELECTRO/FERALIGATOR' }, { name: 'CELEBI', value: 'CELEBI' }))
    .addStringOption(option => option.setName('account').setDescription('Account (Celebi only)')
      .addChoices(
        { name: 'MAIN', value: 'MAIN' },
        { name: 'Alt 1', value: 'Alt 1' },
        { name: 'Alt 2', value: 'Alt 2' },
        { name: 'Alt 3', value: 'Alt 3' }
      ))
    .addNumberOption(option => option.setName('amount').setDescription('Custom amount (Captain only)')),

  async execute(interaction) {
    await interaction.deferReply();
    const link = interaction.options.getString('link');
    const sheetKey = interaction.options.getString('sheet');
    const config = SHEET_CONFIGS[sheetKey];

    if (!config.spreadsheetId) {
      return interaction.editReply(`⚠️ **${config.label}** sheet is not configured (missing spreadsheet ID env var).`);
    }

    const channelError = checkChannel(interaction, config);
    if (channelError) return interaction.editReply(channelError);

    const sheetTitle = await getSheetTitle(config.spreadsheetId);

    // Duplicate link check (scanned from the sheet's real data start row)
    const linkCol = config.colLetters.link;
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `'${sheetTitle}'!${linkCol}${config.startRow}:${linkCol}`
    });
    const existingLinks = existingData.data.values || [];
    const duplicateIndex = existingLinks.findIndex(row => row[0] && row[0].trim() === link.trim());
    if (duplicateIndex !== -1) {
      return interaction.editReply(`⚠️ **Duplicate Link detected!** Already logged on row **${duplicateIndex + config.startRow}**.`);
    }

    const today = new Date();
    const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

    let newRow, replyText;

    if (sheetKey === 'captain') {
      const customAmount = interaction.options.getNumber('amount');
      const { taskType, amount } = detectTaskDetails(link, customAmount);
      newRow = [formattedDate, taskType, amount, 'Not Paid', link];
      replyText = `✅ **Logged to Captain!**\n📅 **Date:** ${formattedDate}\n📝 **Type:** ${taskType}\n💵 **Amount:** $${amount.toFixed(2)}\n🔗 **Link:** ${link}`;
    } else {
      const provider = interaction.options.getString('provider');
      const account = interaction.options.getString('account');
      if (!provider || !account) {
        return interaction.editReply('⚠️ **provider** and **account** are required when logging to Celebi.');
      }
      const { taskType, credits } = detectCelebiTaskDetails(link);
      newRow = [provider, formattedDate, link, account, taskType, credits, 'LIVE', ''];
      replyText = `✅ **Logged to Celebi!**\n🏷️ **Provider:** ${provider}\n📅 **Date:** ${formattedDate}\n👤 **Account:** ${account}\n📝 **Type:** ${taskType}\n💳 **Credits:** ${credits}\n🔗 **Link:** ${link}`;
    }

    // Write to the next empty row after the table (found from startRow, so
    // header/label content above the table on sheets like Celebi is ignored).
    const lastRow = await getLastDataRow(config.spreadsheetId, sheetTitle, config.startRow, config.colLetters.provider || config.colLetters.date);
    const nextRow = Math.max(lastRow + 1, config.startRow);
    const range = `'${sheetTitle}'!A${nextRow}:${config.lastCol}${nextRow}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRow] }
    });

    await logHistory(config.spreadsheetId, {
      user: interaction.user.tag,
      command: 'log',
      range,
      oldValues: [],
      newValues: [newRow]
    });

    return interaction.editReply(replyText);
  }
};
