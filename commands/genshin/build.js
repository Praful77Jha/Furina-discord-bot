const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { getCharacterInfo } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");

const HEADERS = { "User-Agent": "FurinaDiscordBot/1.0" };
const showcaseCache = new Map();

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
      option.setName("account").setDescription("Select account preset").addChoices(
        { name: "NORMIE (MAIN)", value: "main" },
        { name: "NOT_NORMIE (ALT)", value: "alt" }
      )
    )
    .addStringOption(option => option.setName("uid").setDescription("Or type custom UID directly")),

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
    const targetUid = customUid || (accountChoice === "alt" ? UIDS.ALT : UIDS.MAIN);

    try {
      const response = await axios.get(`https://enka.network/api/uid/${targetUid}`, { headers: HEADERS, timeout: 15000 });
      const data = response.data;

      if (!data.avatarInfoList || data.avatarInfoList.length === 0) {
        return interaction.editReply(`No showcased characters found for UID \`${targetUid}\`.`);
      }

      const avatarList = data.avatarInfoList;
      showcaseCache.set(targetUid, { avatarList, fetchedAt: Date.now() });

      const selectOptions = await Promise.all(avatarList.map(async (avatar, index) => {
        const info = await getCharacterInfo(avatar.avatarId);
        const style = getElementStyle(info?.element);
        return {
          label: `${style.emoji} ${info?.name || "Unknown"}`,
          description: `Level ${avatar.propMap["4001"]?.val || "N/A"}`,
          value: `${targetUid}_${index}`
        };
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("select_build_character")
          .setPlaceholder("Select a showcased character...")
          .addOptions(selectOptions)
      );

      const firstChar = avatarList[0];
      const buffer = await fetchEnkaCard(targetUid, firstChar.avatarId);
      const attachment = new AttachmentBuilder(buffer, { name: "build.png" });
      await interaction.editReply({ files: [attachment], components: [row] });

    } catch (error) {
      console.error("Build error:", error.message);
      return interaction.editReply(`Failed to fetch data for UID \`${targetUid}\`.`);
    }
  },

  async handleCharacterSelect(interaction) {
    const [targetUid, indexStr] = interaction.values[0].split("_");
    const index = parseInt(indexStr, 10);

    const cached = showcaseCache.get(targetUid);
    if (!cached) {
      return interaction.reply({ content: "This showcase has expired — run `/build` again.", ephemeral: true });
    }

    const avatar = cached.avatarList[index];
    if (!avatar) {
      return interaction.reply({ content: "Character not found.", ephemeral: true });
    }

    await interaction.deferUpdate();

    try {
      const buffer = await fetchEnkaCard(targetUid, avatar.avatarId);
      const attachment = new AttachmentBuilder(buffer, { name: "build.png" });
      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      const charInfo = await getCharacterInfo(avatar.avatarId);
      const style = getElementStyle(charInfo?.element);
      const embed = new EmbedBuilder()
        .setTitle(`${style.emoji} ${charInfo?.name || "Unknown"}`)
        .setColor(style.color)
        .setDescription(`Enka card unavailable.\nUID: \`${targetUid}\``);
      await interaction.editReply({ embeds: [embed], components: [] });
    }
  }
};
