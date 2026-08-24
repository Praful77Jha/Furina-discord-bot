const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");

function calculateCV(artifacts) {
  let totalCV = 0;
  if (!artifacts) return 0;
  
  artifacts.forEach(art => {
    const subStats = art.flat?.reliquarySubstats || [];
    subStats.forEach(sub => {
      if (sub.appendPropId === "FIGHT_PROP_CRITICAL") totalCV += sub.statValue * 2;
      if (sub.appendPropId === "FIGHT_PROP_CRITICAL_HURT") totalCV += sub.statValue;
    });
  });
  return totalCV.toFixed(1);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("build")
    .setDescription("Fetch Genshin character showcase, CV breakdown, and artifact stats.")
    .addStringOption(option =>
      option
        .setName("account")
        .setDescription("Select account preset")
        .addChoices(
          { name: "NORMIE (MAIN)", value: "main" },
          { name: "NOT_NORMIE (ALT)", value: "alt" }
        )
    )
    .addStringOption(option =>
      option
        .setName("uid")
        .setDescription("Or type custom UID directly")
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ 
        content: "This command can only be used inside the Genshin category.", 
        ephemeral: true 
      });
    }
    if (interaction.channelId !== CHANNELS.BUILD_CHECK) {
      return interaction.reply({ 
        content: `Please use this command in <#${CHANNELS.BUILD_CHECK}>.`, 
        ephemeral: true 
      });
    }

    await interaction.deferReply();

    const accountChoice = interaction.options.getString("account");
    const customUid = interaction.options.getString("uid");
    
    let targetUid = customUid;
    if (!targetUid) {
      targetUid = accountChoice === "alt" ? UIDS.ALT : UIDS.MAIN;
    }

    try {
      const response = await axios.get(`https://enka.network/api/uid/${targetUid}`);
      const data = response.data;

      if (!data.avatarInfoList || data.avatarInfoList.length === 0) {
        return interaction.editReply(`No showcased characters found for UID \`${targetUid}\`. Check character showcase settings in-game.`);
      }

      const playerInfo = data.playerInfo;
      const avatarList = data.avatarInfoList;

      const selectOptions = avatarList.map((avatar, index) => ({
        label: `Character ID: ${avatar.avatarId}`, 
        description: `Level ${avatar.propMap["4001"]?.val || "N/A"}`,
        value: `${targetUid}_${index}`
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_build_character")
        .setPlaceholder("Select a showcased character...")
        .addOptions(selectOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const firstChar = avatarList[0];
      const artifacts = firstChar.equipList?.filter(item => item.flat.itemType === "ITEM_RELIQUARY");
      const cv = calculateCV(artifacts);

      const embed = new EmbedBuilder()
        .setTitle(`${playerInfo.nickname}'s Showcase (UID: ${targetUid})`)
        .setColor("#00AE55")
        .setDescription(`**Active Character ID:** ${firstChar.avatarId}\n**Level:** ${firstChar.propMap["4001"]?.val || "N/A"}`)
        .addFields(
          { name: "Total Artifact CV", value: `${cv}`, inline: true },
          { name: "World Level", value: `${playerInfo.worldLevel || "N/A"}`, inline: true }
        )
        .setFooter({ text: "Furina Discord Bot • Enka Network API" });

      await interaction.editReply({ embeds: [embed], components: [row] });

    } catch (error) {
      console.error(error);
      return interaction.editReply(`Failed to fetch data for UID \`${targetUid}\`. API might be down or UID is invalid.`);
    }
  }
};