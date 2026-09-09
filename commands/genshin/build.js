const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { getCharacterInfo } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");

const HEADERS = { "User-Agent": "FurinaDiscordBot/1.0" };

async function fetchEnkaCard(uid, avatarId) {
  const url = `https://cards.enka.network/u/${uid}/${avatarId}/image?lang=en&substats=true&uid=true`;
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: HEADERS
  });
  return Buffer.from(response.data);
}

async function fetchShowcaseChars(uid) {
  const response = await axios.get(`https://enka.network/api/uid/${uid}`, { headers: HEADERS, timeout: 15000 });
  const data = response.data;
  if (!data.avatarInfoList) return [];
  const results = [];
  for (const avatar of data.avatarInfoList) {
    const info = await getCharacterInfo(avatar.avatarId);
    if (info && info.name) {
      results.push({ name: info.name, avatarId: avatar.avatarId });
    }
  }
  return results;
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
      const response = await axios.get(`https://enka.network/api/uid/${targetUid}`, { headers: HEADERS, timeout: 15000 });
      const data = response.data;

      if (!data.avatarInfoList || data.avatarInfoList.length === 0) {
        return interaction.editReply(`No showcased characters found for UID \`${targetUid}\`.`);
      }

      const avatarList = data.avatarInfoList;
      let matchedAvatar = null;

      for (const avatar of avatarList) {
        const info = await getCharacterInfo(avatar.avatarId);
        if (info && info.name && info.name.toLowerCase() === characterName.toLowerCase()) {
          matchedAvatar = avatar;
          break;
        }
      }

      if (!matchedAvatar) {
        for (const avatar of avatarList) {
          const info = await getCharacterInfo(avatar.avatarId);
          if (info && info.name && info.name.toLowerCase().includes(characterName.toLowerCase())) {
            matchedAvatar = avatar;
            break;
          }
        }
      }

      if (!matchedAvatar) {
        const charList = await Promise.all(avatarList.map(async (a) => {
          const info = await getCharacterInfo(a.avatarId);
          return info?.name || "Unknown";
        }));
        return interaction.editReply(`**${characterName}** not found in showcase.\nAvailable: ${charList.join(", ")}`);
      }

      try {
        const buffer = await fetchEnkaCard(targetUid, matchedAvatar.avatarId);
        const attachment = new AttachmentBuilder(buffer, { name: "build.png" });
        await interaction.editReply({ files: [attachment] });
      } catch (cardErr) {
        const charInfo = await getCharacterInfo(matchedAvatar.avatarId);
        const style = getElementStyle(charInfo?.element);
        const embed = new EmbedBuilder()
          .setTitle(`${style.emoji} ${charInfo?.name || "Unknown"}`)
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
    if (!focused) return;

    try {
      const chars = await fetchShowcaseChars(UIDS.MAIN);
      const choices = chars
        .filter(c => c.name.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25)
        .map(c => ({ name: c.name, value: c.name }));
      await interaction.respond(choices);
    } catch (error) {
      console.error("Autocomplete error:", error.message);
      await interaction.respond([]);
    }
  }
};
