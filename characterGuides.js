// Hand-curated build-guide data (Game8-style) for /character dropdown views.
// No public API publishes tiers, builds, teams, stat goals or talent
// priority, so each character needs an entry here. Characters WITHOUT an
// entry still get the API profile card; their dropdown views show a
// "guide not added yet" card instead.
// To add a character: copy the Sandrone template below. element/weapon/
// rarity should match enkaCharacterData naming (element like "Cryo").
const GUIDES = {
  sandrone: {
    name: "Sandrone",
    element: "Cryo",
    weapon: "Claymore",
    rarity: 5,
    rating: "SS",
    va: { en: "Deneen Melody", jp: "Honda Mariko" },
    tiers: { main: "SS", sub: "-", support: "-", exploration: "SS" },
    build: {
      title: "Stellar-Conduct Build",
      weapon: "A Teaspoon of Transcendence",
      altWeapons: [
        "A Thousand Blazing Suns",
        "Redhorn Stonethresher",
        "Verdict",
        "Mailed Flower",
        "Tidal Shadow"
      ],
      artifact: "Disenchantment in Deep Shadows",
      altArtifacts: ["Gilded Dreams x4"],
      mainStats: { sands: "ATK% or EM", goblet: "ATK% or EM", circlet: "CRIT DMG >= CRIT Rate" },
      subStats: ["Energy Recharge (until requirement)", "CRIT DMG", "CRIT Rate", "ATK", "Elemental Mastery"]
    },
    teams: [
      {
        label: "Premium",
        members: ["Sandrone", "Yae Miko", "Odette", "Nicole"],
        note: "Best teammates right now. Yae assumed C1."
      },
      {
        label: "F2P",
        members: ["Sandrone", "Beidou", "Sucrose", "Qiqi"],
        note: "Swap twice with Sucrose to keep her buffs up."
      }
    ],
    statGoals: [
      ["ATK", "2,000+"],
      ["Energy Recharge", "125 ~ 145%"],
      ["CRIT Rate", "30~40% (before set bonus + ascension)"],
      ["CRIT DMG", "180% or Above"],
      ["Elemental Mastery", "150 - 200"]
    ],
    talentPriority: ["Normal Attack", "Elemental Burst", "Elemental Skill"],
    talentNote: "Charged attacks carry her damage - Normal Attacks first, then Burst. Skill last.",
    weapons: [
      { name: "A Teaspoon of Transcendence", tag: "Best-in-Slot", note: "Signature. ATK% plus Stellar-Conduct DMG on Charged Attacks." },
      { name: "A Thousand Blazing Suns", tag: "Alternative", note: "Huge CRIT DMG after Skill/Burst, both in her rotation." },
      { name: "Redhorn Stonethresher", tag: "CRIT stat stick", note: "DEF effect wasted, still great for CRIT DMG alone." },
      { name: "Mailed Flower", tag: "F2P (Event)", note: "ATK + EM with easy uptime. 2023 Windblume exclusive." },
      { name: "Tidal Shadow", tag: "F2P (Craftable)", note: "Big ATK buff when healed - easy with Qiqi/Escoffier." },
      { name: "Verdict", tag: "Alternative", note: "Usable gacha option." },
      { name: "Lithic Blade", tag: "F2P (Gacha)", note: "Works with Liyue teammates (Beidou, Qiqi) for ATK + CRIT Rate." }
    ],
    artifacts: [
      { name: "Disenchantment in Deep Shadows", tag: "Best-in-Slot", note: "Buffs Stellar-Conduct and adds CRIT Rate. Best by a wide margin." },
      { name: "Gilded Dreams x4", tag: "Alternative", note: "ATK/EM buffs, easy to trigger in her teams." },
      { name: "Gladiator's Finale x2 + ATK 2pc", tag: "Temporary", note: "Stopgap while farming. 4-star pieces suffice early." }
    ]
  }
};

function normalize(name) {
  return String(name || "").toLowerCase().trim();
}

let AUTO_BUILDS = {};
try {
  AUTO_BUILDS = require("./characterGuides.auto").AUTO_BUILDS || {};
} catch {}

// Builds a full-shape guide from auto hub data (build + basic gear).
// Tiers/teams/goals/priority stay null -> those views show "not added yet".
function synthesize(auto) {
  return {
    name: auto.name,
    element: null,
    weapon: null,
    rarity: null,
    rating: auto.rating || null,
    va: null,
    tiers: auto.tiers || null,
    build: {
      title: (auto.role ? auto.role + " Build" : "Best Build"),
      weapon: auto.weapon,
      altWeapons: auto.altWeapons || [],
      artifact: auto.artifact,
      altArtifacts: auto.altArtifacts || [],
      mainStats: auto.mainStats || { sands: "", goblet: "", circlet: "" },
      subStats: auto.subStats || []
    },
    teams: null,
    statGoals: null,
    talentPriority: null,
    talentNote: "",
    weapons: [
      ...(auto.weapon ? [{ name: auto.weapon, tag: "Best", note: "" }] : []),
      ...(auto.altWeapons || []).map(w => ({ name: w, tag: "Alternative", note: "" }))
    ],
    artifacts: [
      ...(auto.artifact ? [{ name: auto.artifact, tag: "Best", note: "" }] : []),
      ...(auto.altArtifacts || []).map(a => ({ name: a, tag: "Alternative", note: "" }))
    ]
  };
}

async function fetchGame8Data(characterName) {
  const slug = normalize(characterName).replace(/\s+/g, "-");
  const url = `https://game8.co/games/Genshin-Impact/archives/${slug}`;
  try {
    const axios = require("axios");
    const res = await axios.get(url, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } });
    const html = res.data;
    const data = { teams: [], statGoals: [], talentPriority: [] };

    const teamMatch = html.match(/Best\s+(?:Team|Party)[\s\S]*?<\/div>/i);
    if (teamMatch) {
      const members = [...teamMatch[0].matchAll(/>([^<]+)</g)].map(m => m[1].trim()).filter(n => n.length > 2 && n.length < 30);
      if (members.length >= 2) data.teams = [{ label: "Recommended", members: members.slice(0, 4), note: "" }];
    }

    const statMatch = html.match(/(?:Sub\s*Stats?|Stats?\s*to)[\s\S]*?(?:<\/div>|<\/table>)/i);
    if (statMatch) {
      const stats = [...statMatch[0].matchAll(/>([^<]*(?:Rate|DMG|EM|ER|ATK|DEF|HP)[^<]*)</gi)].map(m => m[1].trim()).filter(Boolean);
      if (stats.length) data.statGoals = stats.slice(0, 5).map(s => [s, "Prioritize"]);
    }

    const talentMatch = html.match(/(?:Talent|Skill)\s*(?:Priority|Order)[\s\S]*?(?:<\/div>|<\/ol>)/i);
    if (talentMatch) {
      const talents = [...talentMatch[0].matchAll(/>([^<]*(?:Attack|Skill|Burst|Passive)[^<]*)</gi)].map(m => m[1].trim()).filter(Boolean);
      if (talents.length) data.talentPriority = talents.slice(0, 3);
    }

    return data;
  } catch {
    return null;
  }
}

function getGuide(name) {
  const q = normalize(name);
  if (GUIDES[q]) return GUIDES[q];
  if (AUTO_BUILDS[q]) return synthesize(AUTO_BUILDS[q]);
  const keys = [...Object.keys(GUIDES), ...Object.keys(AUTO_BUILDS)];
  const hit = keys.find(k => q.includes(k) || k.includes(q));
  if (!hit) return null;
  return GUIDES[hit] || synthesize(AUTO_BUILDS[hit]);
}

async function getGuideWithWebData(name) {
  const guide = getGuide(name);
  if (!guide) return null;

  if (!guide.teams && !guide.statGoals && !guide.talentPriority) {
    const webData = await fetchGame8Data(name);
    if (webData) {
      return {
        ...guide,
        teams: guide.teams || webData.teams,
        statGoals: guide.statGoals || webData.statGoals,
        talentPriority: guide.talentPriority || webData.talentPriority
      };
    }
  }
  return guide;
}

module.exports = { getGuide, getGuideWithWebData, fetchGame8Data };
