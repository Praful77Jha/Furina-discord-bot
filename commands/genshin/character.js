const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");
const { findCharacterByName } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");
const { getGuide } = require("../../characterGuides");
const { createCanvas, loadImageSafe, drawImageCover, drawReadabilityGradient, roundRect } = require("../../canvasRenderer");

const CARD_W = 900;
const VIEW_CACHE = new Map();

const VIEWS = [
  { id: "profile", label: "Profile", description: "Rating, rarity, element, weapon, voice actors", emoji: "📋" },
  { id: "tier", label: "Tier List Rankings", description: "Main / Sub / Support / Exploration ranks", emoji: "🏆" },
  { id: "build", label: "Best Build", description: "Weapon, artifacts, main stats, substats", emoji: "⚔️" },
  { id: "teams", label: "Team Comps", description: "Premium and F2P teams", emoji: "👥" },
  { id: "stats", label: "Stat Goals", description: "Target stat values", emoji: "🎯" },
  { id: "talents", label: "Talent Priority", description: "Level order and notes", emoji: "🌀" },
  { id: "gear", label: "Weapons & Artifacts", description: "Full gear list with notes", emoji: "🎒" }
];

function normalize(name) {
  return String(name || "").toLowerCase().trim();
}

function wrapLines(ctx, text, maxWidth, maxLines = 4) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[lines.length - 1] += "…";
  }
  return lines;
}

function baseCanvas(ctx2dHeight) {
  const canvas = createCanvas(CARD_W, ctx2dHeight);
  return { canvas, ctx: canvas.getContext("2d") };
}

function paintShell(ctx, h, style, title, subtitle) {
  const colorHex = `#${style.color.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = "#0B0E14";
  ctx.fillRect(0, 0, CARD_W, h);
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, CARD_W, 5);
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText(title, 30, 48);
  if (subtitle) {
    ctx.fillStyle = "#7A8AA0";
    ctx.font = "15px sans-serif";
    ctx.fillText(subtitle, 30, 72);
  }
  ctx.fillStyle = "#445566";
  ctx.font = "12px sans-serif";
  ctx.fillText("Furina Discord Bot  •  Character Guide", 30, h - 16);
  return colorHex;
}

function sectionTitle(ctx, text, x, y, colorHex) {
  ctx.fillStyle = colorHex;
  ctx.font = "bold 17px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(text, x, y);
}

async function drawMemberIcon(ctx, name, x, y, size = 56) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  let img = null;
  try {
    const info = await findCharacterByName(name);
    if (info?.icon) img = await loadImageSafe(info.icon);
  } catch {}
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = "#1A2030";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${Math.round(size * 0.45)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(String(name || "?").charAt(0).toUpperCase(), cx, cy + Math.round(size * 0.16));
  }
  ctx.restore();
  ctx.strokeStyle = "#3A4356";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#C8D0DC";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  const label = name.length > 14 ? name.slice(0, 13) + "…" : name;
  ctx.fillText(label, cx, y + size + 16);
}

// ---------- VIEWS ----------

async function renderProfile(cached) {
  const { enkaChar, dbChar, guide } = cached;
  const name = guide?.name || enkaChar?.name || "Unknown";
  const style = getElementStyle(guide?.element || enkaChar?.element);
  const H = 470;
  const { canvas, ctx } = baseCanvas(H);
  const colorHex = paintShell(ctx, H, style, `${style.emoji} ${name}`, "Character Information");

  const splash = await loadImageSafe(enkaChar?.splashArt);
  const artW = 330;
  if (splash) {
    drawImageCover(ctx, splash, 0, 90, artW, H - 90);
    drawReadabilityGradient(ctx, artW, H - 90, "bottom");
  } else {
    const grad = ctx.createLinearGradient(0, 90, artW, H);
    grad.addColorStop(0, "#1A2030");
    grad.addColorStop(1, colorHex + "55");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 90, artW, H - 90);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 120px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(name.charAt(0), artW / 2, 90 + (H - 90) / 2 + 40);
  }

  const rows = [];
  if (guide?.rating) rows.push(["Rating", guide.rating, "#FFD700"]);
  const rarity = guide?.rarity || enkaChar?.rarity;
  if (rarity) rows.push(["Rarity", "★".repeat(rarity), "#4FC3F7"]);
  const element = guide?.element || enkaChar?.element;
  if (element) {
    const es = getElementStyle(element);
    rows.push(["Element", `${es.emoji} ${es.label}`, "#FFFFFF"]);
  }
  const weapon = guide?.weapon || enkaChar?.weaponType;
  if (weapon) rows.push(["Weapon", weapon, "#FFFFFF"]);
  if (guide?.va) {
    rows.push(["Voice Actors", `${guide.va.en} (EN)`, "#C8D0DC"]);
    rows.push(["", guide.va.jp + " (JP)", "#C8D0DC"]);
  } else if (dbChar?.nation) {
    rows.push(["Nation", dbChar.nation, "#C8D0DC"]);
  }

  const x0 = artW + 20;
  const x1 = x0 + 190;
  let y = 130;
  ctx.textAlign = "left";
  rows.forEach(([label, value, color]) => {
    ctx.fillStyle = "#7A8AA0";
    ctx.font = "bold 16px sans-serif";
    if (label) ctx.fillText(label, x0, y);
    ctx.fillStyle = color;
    ctx.font = "bold 17px sans-serif";
    ctx.fillText(value, x1, y);
    y += 16;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x0, y, CARD_W - x0 - 30, 1);
    y += 30;
  });

  return canvas.toBuffer("image/png");
}

async function renderNoGuide(cached, viewLabel) {
  const { enkaChar, guide, displayName } = cached;
  const style = getElementStyle(guide?.element || enkaChar?.element);
  const H = 260;
  const { canvas, ctx } = baseCanvas(H);
  paintShell(ctx, H, style, `${style.emoji} ${displayName}`, viewLabel);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Guide not added yet", CARD_W / 2, 140);
  ctx.fillStyle = "#8899B0";
  ctx.font = "15px sans-serif";
  ctx.fillText("Send a Game8-style build page and it will be added here.", CARD_W / 2, 170);
  return canvas.toBuffer("image/png");
}

async function renderTier(cached) {
  const { guide, displayName, enkaChar } = cached;
  if (!guide?.tiers) return renderNoGuide(cached, "Tier List Rankings");
  const style = getElementStyle(guide.element || enkaChar?.element);
  const H = 360;
  const { canvas, ctx } = baseCanvas(H);
  const colorHex = paintShell(ctx, H, style, `${style.emoji} ${displayName}`, "Tier List Rankings");
  sectionTitle(ctx, "▍TIER LIST RANKINGS", 30, 115, colorHex);

  const cols = [["Main DPS", guide.tiers.main], ["Sub-DPS", guide.tiers.sub], ["Support", guide.tiers.support], ["Exploration", guide.tiers.exploration]];
  const cw = (CARD_W - 60) / 4;
  let x = 30;
  const y0 = 135;
  cols.forEach(([label, rank]) => {
    roundRect(ctx, x, y0, cw - 8, 110, 10);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.fillStyle = "#7A8AA0";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + (cw - 8) / 2, y0 + 30);
    ctx.fillStyle = rank && rank !== "-" ? "#FFD700" : "#556677";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText(rank || "-", x + (cw - 8) / 2, y0 + 78);
    x += cw;
  });

  if (guide.rating) {
    ctx.fillStyle = "#8899B0";
    ctx.font = "15px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Overall rating: ${guide.rating}`, 30, y0 + 150);
  }
  return canvas.toBuffer("image/png");
}

async function renderBuild(cached) {
  const { guide, displayName, enkaChar } = cached;
  if (!guide?.build) return renderNoGuide(cached, "Best Build");
  const style = getElementStyle(guide.element || enkaChar?.element);
  const b = guide.build;
  const H = 700;
  const { canvas, ctx } = baseCanvas(H);
  const colorHex = paintShell(ctx, H, style, `${style.emoji} ${displayName}`, b.title || "Best Build");
  let y = 118;
  ctx.textAlign = "left";

  sectionTitle(ctx, "▍WEAPON", 30, y, colorHex);
  y += 28;
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 17px sans-serif";
  ctx.fillText(`★ ${b.weapon}`, 30, y);
  y += 24;
  ctx.fillStyle = "#8899B0";
  ctx.font = "14px sans-serif";
  (b.altWeapons || []).slice(0, 5).forEach(w => {
    ctx.fillText(`• ${w}`, 30, y);
    y += 21;
  });

  y += 10;
  sectionTitle(ctx, "▍ARTIFACTS", 30, y, colorHex);
  y += 28;
  ctx.fillStyle = "#4FC3F7";
  ctx.font = "bold 17px sans-serif";
  ctx.fillText(b.artifact, 30, y);
  y += 24;
  ctx.fillStyle = "#8899B0";
  ctx.font = "14px sans-serif";
  (b.altArtifacts || []).slice(0, 3).forEach(a => {
    ctx.fillText(`• ${a}`, 30, y);
    y += 21;
  });

  y += 10;
  sectionTitle(ctx, "▍MAIN STATS", 30, y, colorHex);
  y += 26;
  ctx.font = "15px sans-serif";
  const ms = b.mainStats || {};
  [["Sands", ms.sands], ["Goblet", ms.goblet], ["Circlet", ms.circlet]].forEach(([k, v]) => {
    if (!v) return;
    ctx.fillStyle = "#7A8AA0";
    ctx.fillText(k + ":  ", 30, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(v, 30 + ctx.measureText(k + ":  ").width + 60, y);
    ctx.font = "15px sans-serif";
    y += 23;
  });

  y += 8;
  sectionTitle(ctx, "▍SUBSTAT PRIORITY", 30, y, colorHex);
  y += 26;
  ctx.fillStyle = "#C8D0DC";
  ctx.font = "15px sans-serif";
  (b.subStats || []).slice(0, 5).forEach((s, i) => {
    ctx.fillText(`${i + 1}. ${s}`, 30, y);
    y += 23;
  });

  return canvas.toBuffer("image/png");
}

async function renderTeams(cached) {
  const { guide, displayName, enkaChar } = cached;
  if (!guide?.teams?.length) return renderNoGuide(cached, "Team Comps");
  const style = getElementStyle(guide.element || enkaChar?.element);
  const perTeam = 175;
  const H = 130 + guide.teams.slice(0, 3).length * perTeam + 40;
  const { canvas, ctx } = baseCanvas(H);
  const colorHex = paintShell(ctx, H, style, `${style.emoji} ${displayName}`, "Team Comps");
  let y = 118;

  for (const team of guide.teams.slice(0, 3)) {
    roundRect(ctx, 30, y, CARD_W - 60, perTeam - 12, 12);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.fillStyle = colorHex;
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(team.label || "Team", 48, y + 28);

    let ix = 48;
    for (const m of (team.members || []).slice(0, 4)) {
      await drawMemberIcon(ctx, m, ix, y + 42, 58);
      ix += 92;
    }
    ctx.fillStyle = "#8899B0";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "left";
    const lines = wrapLines(ctx, team.note || "", CARD_W - 120, 2);
    lines.forEach((ln, i) => ctx.fillText(ln, 48, y + 128 + i * 18));
    y += perTeam;
  }
  return canvas.toBuffer("image/png");
}

async function renderStats(cached) {
  const { guide, displayName, enkaChar } = cached;
  if (!guide?.statGoals?.length) return renderNoGuide(cached, "Stat Goals");
  const style = getElementStyle(guide.element || enkaChar?.element);
  const H = 150 + guide.statGoals.length * 46 + 40;
  const { canvas, ctx } = baseCanvas(H);
  const colorHex = paintShell(ctx, H, style, `${style.emoji} ${displayName}`, "Stat Goal Values");
  sectionTitle(ctx, "▍STAT GOALS", 30, 118, colorHex);
  let y = 150;
  ctx.textAlign = "left";
  guide.statGoals.forEach(([stat, goal]) => {
    roundRect(ctx, 30, y, CARD_W - 60, 38, 8);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.fillStyle = "#7A8AA0";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(stat, 48, y + 24);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(goal, CARD_W - 48, y + 24);
    ctx.textAlign = "left";
    y += 46;
  });
  return canvas.toBuffer("image/png");
}

async function renderTalents(cached) {
  const { guide, displayName, enkaChar, dbChar } = cached;
  const style = getElementStyle(guide?.element || enkaChar?.element);
  const prio = guide?.talentPriority;
  const H = 400;
  const { canvas, ctx } = baseCanvas(H);
  const colorHex = paintShell(ctx, H, style, `${style.emoji} ${displayName}`, "Talent Priority");
  if (!prio?.length) return renderNoGuide(cached, "Talent Priority");

  const medals = ["1st", "2nd", "3rd"];
  const cw = (CARD_W - 60) / 3;
  let x = 30;
  prio.slice(0, 3).forEach((t, i) => {
    roundRect(ctx, x, 115, cw - 10, 110, 10);
    ctx.fillStyle = i === 0 ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.fillStyle = i === 0 ? "#FFD700" : "#7A8AA0";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(medals[i], x + (cw - 10) / 2, 140);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 16px sans-serif";
    const lines = wrapLines(ctx, t, cw - 40, 2);
    lines.forEach((ln, j) => ctx.fillText(ln, x + (cw - 10) / 2, 168 + j * 20));
    x += cw;
  });

  const note = guide.talentNote || (dbChar?.skillTalents || []).slice(0, 2).map(t => t.name).join(" • ");
  if (note) {
    ctx.fillStyle = "#8899B0";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    wrapLines(ctx, note, CARD_W - 60, 4).forEach((ln, i) => ctx.fillText(ln, 30, 260 + i * 22));
  }
  return canvas.toBuffer("image/png");
}

async function renderGear(cached) {
  const { guide, displayName, enkaChar } = cached;
  if (!guide?.weapons?.length && !guide?.artifacts?.length) return renderNoGuide(cached, "Weapons & Artifacts");
  const style = getElementStyle(guide.element || enkaChar?.element);
  const items = [...(guide.weapons || []).map(w => ({ ...w, kind: "⚔" })), ...(guide.artifacts || []).map(a => ({ ...a, kind: "🏺" }))];
  const H = 140 + items.slice(0, 12).length * 78 + 30;
  const { canvas, ctx } = baseCanvas(H);
  const colorHex = paintShell(ctx, H, style, `${style.emoji} ${displayName}`, "Weapons & Artifacts");
  let y = 120;
  ctx.textAlign = "left";
  for (const item of items.slice(0, 12)) {
    roundRect(ctx, 30, y, CARD_W - 60, 70, 10);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 15px sans-serif";
    const title = `${item.kind} ${item.name}`;
    ctx.fillText(title.length > 52 ? title.slice(0, 50) + "…" : title, 46, y + 24);
    if (item.tag) {
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(item.tag, CARD_W - 46, y + 24);
      ctx.textAlign = "left";
    }
    ctx.fillStyle = "#8899B0";
    ctx.font = "13px sans-serif";
    wrapLines(ctx, item.note || "", CARD_W - 120, 2).forEach((ln, i) => ctx.fillText(ln, 46, y + 46 + i * 17));
    y += 78;
  }
  return canvas.toBuffer("image/png");
}

const RENDERERS = {
  profile: renderProfile,
  tier: renderTier,
  build: renderBuild,
  teams: renderTeams,
  stats: renderStats,
  talents: renderTalents,
  gear: renderGear
};

function buildRow(cacheKey) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_character_view")
      .setPlaceholder("Choose a section...")
      .addOptions(VIEWS.map(v => ({
        label: `${v.emoji} ${v.label}`,
        description: v.description,
        value: `${cacheKey}::${v.id}`
      })))
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("character")
    .setDescription("Character guide: profile, tiers, builds, teams and more.")
    .addStringOption(option =>
      option.setName("name").setDescription("Character name (e.g. sandrone, furina, raiden)").setRequired(true)
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
      const enkaChar = await findCharacterByName(query);
      const guide = getGuide(query) || (enkaChar ? getGuide(enkaChar.name) : null);
      if (!enkaChar && !guide) {
        return interaction.editReply(`Could not find character \`${query}\`. Check the spelling and try again.`);
      }

      const displayName = enkaChar?.name || guide.name;
      const cacheKey = enkaChar?.avatarId ? String(enkaChar.avatarId) : "g:" + normalize(displayName);

      let dbChar = null;
      try {
        const dbRes = await axios.get(`https://genshin.jmp.blue/characters/${normalize(displayName)}`, { timeout: 10000 });
        dbChar = dbRes.data;
      } catch {}

      VIEW_CACHE.set(cacheKey, { displayName, enkaChar: enkaChar || null, dbChar, guide });
      if (VIEW_CACHE.size > 50) {
        const first = VIEW_CACHE.keys().next().value;
        VIEW_CACHE.delete(first);
      }

      const buffer = await renderProfile(VIEW_CACHE.get(cacheKey));
      const attachment = new AttachmentBuilder(buffer, { name: "character.png" });
      await interaction.editReply({ files: [attachment], components: [buildRow(cacheKey)] });

    } catch (error) {
      console.error(error);
      return interaction.editReply(`Could not find character \`${query}\`. Check the spelling and try again.`);
    }
  },

  async handleViewSelect(interaction) {
    const raw = interaction.values[0] || "";
    const sep = raw.lastIndexOf("::");
    const cacheKey = raw.slice(0, sep);
    const view = raw.slice(sep + 2);

    const cached = VIEW_CACHE.get(cacheKey);
    if (!cached) {
      return interaction.reply({ content: "This guide has expired - run `/character` again.", ephemeral: true });
    }

    await interaction.deferUpdate();
    try {
      const renderer = RENDERERS[view] || renderProfile;
      const buffer = await renderer(cached);
      const attachment = new AttachmentBuilder(buffer, { name: "character.png" });
      await interaction.editReply({ files: [attachment], components: [buildRow(cacheKey)] });
    } catch (error) {
      console.error("Character view error:", error.message);
      await interaction.editReply({ content: "Could not render that section.", components: [buildRow(cacheKey)] });
    }
  }
};
