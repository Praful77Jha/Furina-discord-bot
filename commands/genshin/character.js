const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");
const { findCharacterByName } = require("../../enkaCharacterData");

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

    const query = interaction.options.getString("name");

    try {
      // gsi.fly.dev is dead (fails even on real, current characters) — this pulls
      // straight from Enka's own character database instead, which is kept current.
      const char = await findCharacterByName(query);

      if (!char) {
        return interaction.editReply(`Could not find character \`${query}\`. Check the spelling and try again.`);
      }

      const embed = new EmbedBuilder()
        .setTitle(char.name)
        .setColor("#0099FF")
        .addFields(
          { name: "Rarity", value: char.rarity ? "⭐".repeat(char.rarity) : "N/A", inline: true },
          { name: "Element", value: char.element || "N/A", inline: true },
          { name: "Weapon Type", value: char.weaponType || "N/A", inline: true }
        )
        .setFooter({ text: "Furina Discord Bot • Enka Network Data" });

      if (char.icon) embed.setThumbnail(char.icon);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(error);
      return interaction.editReply(`Could not find character \`${query}\`. Check the spelling and try again.`);
    }
  }
};