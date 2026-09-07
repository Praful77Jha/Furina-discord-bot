const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");
const { findCharacterByName } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("character")
    .setDescription("Fetch talents, constellations, and info for a Genshin character.")
    .addStringOption(option =>
      option.setName("name").setDescription("Character name (e.g. furina, raiden, zhongli)").setRequired(true)
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "This command can only be used inside the Genshin category.", ephemeral: true });
    }
    if (interaction.channelId !== CHANNELS.CHARACTER_INFO) {
      return interaction.reply({ content: `Please use this command in <#${CHANNELS.CHARACTER_INFO}>.`, ephemeral: true });
    }

    await interaction.deferReply();

    const query = interaction.options.getString("name");

    try {
      // Splash art / element / rarity from Enka (already reliable, used by /build too).
      const enkaChar = await findCharacterByName(query);
      if (!enkaChar) {
        return interaction.editReply(`Could not find character \`${query}\`. Check the spelling and try again.`);
      }

      // Talents + constellations from genshin-db's public API — Enka's own data
      // dump doesn't include skill/constellation text, only showcase stats.
      const dbRes = await axios
        .get(`https://genshin-db-api.vercel.app/api/characters?query=${encodeURIComponent(enkaChar.name)}&matchCategories=true`)
        .catch(() => null);
      const charDb = Array.isArray(dbRes?.data) ? dbRes.data[0] : dbRes?.data;

      const style = getElementStyle(enkaChar.element);

      const embed = new EmbedBuilder()
        .setTitle(`${style.emoji} ${enkaChar.name}`)
        .setColor(style.color)
        .addFields(
          { name: "Rarity", value: enkaChar.rarity ? "⭐".repeat(enkaChar.rarity) : "N/A", inline: true },
          { name: "Element", value: style.label, inline: true },
          { name: "Weapon Type", value: enkaChar.weaponType || "N/A", inline: true }
        )
        .setFooter({ text: "Furina Discord Bot • Enka + genshin-db" });

      if (enkaChar.splashArt) embed.setImage(enkaChar.splashArt);
      else if (enkaChar.icon) embed.setThumbnail(enkaChar.icon);

      if (charDb?.talent) {
        const talents = Object.values(charDb.talent).slice(0, 4); // normal attack, skill, burst, passive-ish depending on API shape
        const talentText = talents
          .map(t => `**${t.name}**\n${(t.description || "").slice(0, 120)}${(t.description || "").length > 120 ? "…" : ""}`)
          .join("\n\n");
        if (talentText) embed.addFields({ name: "🌀 Talents", value: talentText.slice(0, 1024), inline: false });
      }

      if (charDb?.constellation) {
        const constellations = Object.values(charDb.constellation);
        const constText = constellations
          .map((c, i) => `**C${i + 1}: ${c.name}**`)
          .join("\n");
        if (constText) embed.addFields({ name: "⭐ Constellations", value: constText.slice(0, 1024), inline: false });
      }

      if (!charDb) {
        embed.addFields({ name: "Note", value: "Talent/constellation data source didn't respond — showing basic info only." });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(error);
      return interaction.editReply(`Could not find character \`${query}\`. Check the spelling and try again.`);
    }
  }
};
