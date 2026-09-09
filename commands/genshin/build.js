const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { getCharacterInfo } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");

const HEADERS = { "User-Agent": "FurinaDiscordBot/1.0" };

// Cache of the showcase (name + avatarId) per UID, so autocomplete
// doesn't have to hit Enka + resolve names on every keystroke.
const SHOWCASE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const showcaseCache = new Map(); // uid -> { data: [{ name, avatarId }], fetchedAt }

async function getShowcaseCharacters(uid) {
  const cached = showcaseCache.get(uid);
  if (cached && Date.now() - cached.fetchedAt < SHOWCASE_CACHE_TTL_MS) {
    return cached.data;
  }

  const response = await axios.get(`https://enka.network/api/uid/${uid}`, { headers: HEADERS, timeout: 15000 });
  const avatarList = response.data.avatarInfoList || [];

  const resolved = await Promise.all(avatarList.map(async (avatar) => {
    const info = await getCharacterInfo(avatar.avatarId);
    return { name: info?.name || "Unknown", avatarId: avatar.avatarId };
  }));

  showcaseCache.set(uid, { data: resolved, fetchedAt: Date.now() });
  return resolved;
}

async function fetchEnkaCard(uid, avatarId) {
  const url = `https://cards.enka.network/u/${uid}/${avatarId}/image?lang=en&substats=true&uid=true`;
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: HEADERS
  });
  return Buffer.from(response.data);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("build")
    .setDescription("Fetch Genshin character build from Enka.Network.")
    .addStringOption(option =>
      option.setName("character").setDescription("Character name").setRequired(true).setAutocomplete(true)
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "This command can only be used inside the Genshin category.", ephemeral: true });
    }
    if (interaction.channelId !== CHANNELS.BUILD_CHECK) {
      return interaction.reply({ content: `Please use this command in <#${CHANNELS.BUILD_CHECK}>.`, ephemeral: true });
    }

    await interaction.deferReply();

    const characterName = interaction.options.getString("character");
    const targetUid = UIDS.MAIN;

    try {
      const showcase = await getShowcaseCharacters(targetUid);

      if (!showcase || showcase.length === 0) {
        return interaction.editReply(`No showcased characters found for UID \`${targetUid}\`.`);
      }

      let matchedAvatar = showcase.find(
        c => c.name.toLowerCase() === characterName.toLowerCase()
      );

      if (!matchedAvatar) {
        matchedAvatar = showcase.find(
          c => c.name.toLowerCase().includes(characterName.toLowerCase())
        );
      }

      if (!matchedAvatar) {
        const charList = showcase.map(c => c.name).join(", ");
        return interaction.editReply(`**${characterName}** not found in showcase.\nAvailable: ${charList}`);
      }

      try {
        const buffer = await fetchEnkaCard(targetUid, matchedAvatar.avatarId);
        const attachment = new AttachmentBuilder(buffer, { name: "build.png" });
        await interaction.editReply({ files: [attachment] });
      } catch (cardErr) {
        const charInfo = await getCharacterInfo(matchedAvatar.avatarId);
        const style = getElementStyle(charInfo?.element);
        const embed = new EmbedBuilder()
          .setTitle(`${style.emoji} ${charInfo?.name || matchedAvatar.name}`)
          .setColor(style.color)
          .setDescription(`Enka card unavailable.\nUID: \`${targetUid}\``);
        await interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
      console.error("Build error:", error.message);
      return interaction.editReply(`Failed to fetch data for UID \`${targetUid}\`.`);
    }
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const targetUid = UIDS.MAIN;

    try {
      const showcase = await getShowcaseCharacters(targetUid);
      const names = showcase.map(c => c.name);

      const filtered = focused
        ? names.filter(n => n.toLowerCase().includes(focused.toLowerCase()))
        : names;

      await interaction.respond(
        filtered.slice(0, 25).map(n => ({ name: n, value: n }))
      );
    } catch (err) {
      console.error("Autocomplete error:", err.message);
      await interaction.respond([]);
    }
  }
};