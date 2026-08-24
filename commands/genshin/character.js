const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("character")
    .setDescription("Fetch detailed info about a Genshin Impact character.")
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("Character name (e.g. furina, raiden, zhongli)")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ 
        content: "This command can only be used inside the Genshin category.", 
        ephemeral: true 
      });
    }
    if (interaction.channelId !== CHANNELS.CHARACTER_INFO) {
      return interaction.reply({ 
        content: `Please use this command in <#${CHANNELS.CHARACTER_INFO}>.`, 
        ephemeral: true 
      });
    }

    await interaction.deferReply();

    const charName = interaction.options.getString("name").toLowerCase().trim().replace(/\s+/g, "-");

    try {
      const response = await axios.get(`https://gsi.fly.dev/v2/characters/${charName}`);
      const char = response.data.result || response.data;

      const embed = new EmbedBuilder()
        .setTitle(char.name || charName.toUpperCase())
        .setColor("#0099FF")
        .setDescription(char.description || "No description available.")
        .addFields(
          { name: "Rarity", value: "⭐".repeat(char.rarity || 5), inline: true },
          { name: "Vision", value: char.vision || char.element || "N/A", inline: true },
          { name: "Weapon", value: char.weapon || "N/A", inline: true },
          { name: "Nation", value: char.nation || "N/A", inline: true },
          { name: "Affiliation", value: char.affiliation || "N/A", inline: true },
          { name: "Constellation", value: char.constellation || "N/A", inline: true }
        )
        .setFooter({ text: "Furina Discord Bot • Genshin API" });

      if (char.icon) {
        embed.setThumbnail(char.icon);
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      return interaction.editReply(`Could not find character \`${charName}\`. Check the spelling and try again.`);
    }
  }
};