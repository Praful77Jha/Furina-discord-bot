const { SlashCommandBuilder } = require("discord.js");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Free Zen model via the real OpenCode CLI (direct API calls are blocked
// for free tier - only OpenCode clients get a session). The bot shells out
// to `opencode run`, which IS OpenCode, so the free model works.
const MODEL = "opencode/mimo-v2.5-free";
const TOOLS_DIR = path.join(os.homedir(), ".ai-cli");
const WORK_DIR = path.join(os.homedir(), ".aiwork");
const CLI_BIN = path.join(
  TOOLS_DIR, "node_modules", ".bin",
  process.platform === "win32" ? "opencode.cmd" : "opencode"
);
const RUN_TIMEOUT_MS = 240000;

// Owner-only for now. Later: add user IDs to ALLOWED_USER_IDS
// (comma-separated, in .env) - no code change needed.
const OWNER_FALLBACK = "828178266649133076";

function getAllowedIds() {
  const ids = new Set([OWNER_FALLBACK]);
  if (process.env.OWNER_ID) ids.add(process.env.OWNER_ID.trim());
  if (process.env.ALLOWED_USER_IDS) {
    process.env.ALLOWED_USER_IDS.split(",").forEach(id => {
      const t = id.trim();
      if (t) ids.add(t);
    });
  }
  return ids;
}

function chunk(text, size = 1900) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function stripAnsi(text) {
  return String(text).replace(new RegExp("\\x1b\\[[0-9;]*m", "g"), "");
}

function cliExists() {
  try {
    return fs.existsSync(CLI_BIN);
  } catch {
    return false;
  }
}

let installing = null;
function ensureCli() {
  if (cliExists()) return Promise.resolve(false);
  if (installing) return installing;
  installing = new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(TOOLS_DIR, { recursive: true });
      fs.mkdirSync(WORK_DIR, { recursive: true });
    } catch {}
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    execFile(npm, ["install", "--prefix", TOOLS_DIR, "opencode-ai"], { timeout: 300000 }, (err) => {
      installing = null;
      if (err || !cliExists()) {
        reject(err || new Error("CLI install produced no binary"));
      } else {
        resolve(true);
      }
    });
  });
  return installing;
}

function runCli(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      OPENCODE_API_KEY: apiKey,
      ZEN_API_KEY: apiKey,
      OPENCODE_DISABLE_AUTOUPDATE: "1"
    };
    // Prompt passed as argv (no shell). Leading dashes stripped so user
    // input can never be parsed as CLI flags.
    const safePrompt = String(prompt).replace(/^-+/, "").slice(0, 1500);
    execFile(CLI_BIN, ["run", "-m", MODEL, safePrompt], {
      cwd: WORK_DIR,
      timeout: RUN_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      env
    }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error("exit " + (err.code || err.signal || "?") + ": " + String(stderr || err.message).slice(0, 500)));
      }
      resolve(stripAnsi(String(stdout || "")).trim());
    });
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask the AI anything (owner-only).")
    .addStringOption(option =>
      option.setName("prompt").setDescription("Your question").setRequired(true)
    ),

  async execute(interaction) {
    if (!getAllowedIds().has(interaction.user.id)) {
      return interaction.reply({ content: "You can't use this command.", ephemeral: true });
    }
    const apiKey = (process.env.ZEN_API_KEY || "").trim();
    if (!apiKey) {
      return interaction.reply({ content: "ZEN_API_KEY is not set on the host.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const prompt = interaction.options.getString("prompt");

    try {
      const justInstalled = await ensureCli().catch((err) => {
        console.error("CLI install failed:", err.message);
        return "INSTALL_FAILED";
      });
      if (justInstalled === "INSTALL_FAILED" || !cliExists()) {
        return interaction.editReply("AI engine install failed - check host logs.");
      }
      if (justInstalled === true) {
        await interaction.editReply("AI engine installed. Running your prompt now...");
      }

      const text = await runCli(prompt, apiKey);
      const parts = chunk(text || "No response.");
      await interaction.editReply(parts[0]);
      for (const p of parts.slice(1)) {
        await interaction.followUp({ content: p, ephemeral: true });
      }
    } catch (err) {
      console.error("ask error:", err.message);
      await interaction.editReply("AI request failed. Check host logs for 'ask error:'.");
    }
  }
};
