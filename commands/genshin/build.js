const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { getCharacterInfo } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");

const HEADERS = {
  "User-Agent": "FurinaDiscordBot/1.0 (Genshin Helper)",
  "Accept": "application/json"
};

async function fetchEnkaCard(uid, avatarId) {
  const url = `https://cards.enka.network/u/${uid}/${avatarId}/image?lang=en&substats=true&uid=true`;
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: { "User-Agent": "FurinaDiscordBot/1.0", "Accept": "image/png" }
  });
  return Buffer.from(response.data);
}

async function fetchEnkaData(uid) {
  const url = `https://enka.network/api/uid/${uid}`;
  const response = await axios.get(url, { timeout: 15000, headers: HEADERS });
  return response.data;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("build")
    .setDescription("Fetch Genshin character build from Enka.Network.")
    .addStringOption(option =>
      option.setName("account").setDescription("Select account preset").addChoices(
        { name: "NORMIE (MAIN)", value: "main" },
        { name: "NOT_NORMIE (ALT)", value: "alt" }
      )
    )
    .addStringOption(option => option.setName("uid").setDescription("Or type custom UID directly"))
    .addStringOption(option =>
      option.setName("character").setDescription("Character name (e.g. Hu Tao, Columbina)").setRequired(true)
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "This command can only be used inside the Genshin category.", ephemeral: true });
    }
    if (interaction.channelId !== CHANNELS.BUILD_CHECK) {
      return interaction.reply({ content: `Please use this command in <#${CHANNELS.BUILD_CHECK}>.`, ephemeral: true });
    }

    await interaction.deferReply();

    const accountChoice = interaction.options.getString("account");
    const customUid = interaction.options.getString("uid");
    const characterName = interaction.options.getString("character");
    const targetUid = customUid || (accountChoice === "alt" ? UIDS.ALT : UIDS.MAIN);

    try {
      const data = await fetchEnkaData(targetUid);

      if (!data.avatarInfoList || data.avatarInfoList.length === 0) {
        return interaction.editReply(`No showcased characters found for UID \`${targetUid}\`.`);
      }

      const avatarList = data.avatarInfoList;
      const searchName = characterName.toLowerCase().trim();
      let matchedAvatar = null;

      for (const avatar of avatarList) {
        const info = await getCharacterInfo(avatar.avatarId);
        if (info && info.name.toLowerCase().includes(searchName)) {
          matchedAvatar = avatar;
          break;
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
          .setDescription(`Enka card unavailable — try again later.\nUID: \`${targetUid}\``)
          .setFooter({ text: "Furina Discord Bot • Enka Network" });
        await interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
      console.error(error);
      return interaction.editReply(`Failed to fetch data for UID \`${targetUid}\`.`);
    }
  }
};
