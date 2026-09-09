const { SlashCommandBuilder } = require("discord.js");
const { execFile } = require("child_process");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Free Zen model via the real OpenCode CLI (direct API calls are blocked
// for free tier - only OpenCode clients get a session). The bot shells out
// to `opencode run`, which IS OpenCode, so the free model works.
const MODEL = "opencode/mimo-v2.5-free";
const TOOLS_DIR = path.join(os.homedir(), ".ai-cli");
const WORK_DIR = path.join(os.homedir(), ".aiwork");
function candidateBins() {
  const exe = process.platform === "win32" ? "opencode.cmd" : "opencode";
  return [
    path.join(TOOLS_DIR, "node_modules", ".bin", exe),
    path.join(TOOLS_DIR, "opencode" + (process.platform === "win32" ? ".exe" : ""))
  ];
}

function resolveCli() {
  for (const p of candidateBins()) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}
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
  return !!resolveCli();
}

function runCmd(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const tail = String(stderr || stdout || err.message).slice(-1000);
        return reject(new Error(cmd + " failed: " + tail));
      }
      resolve(stdout);
    });
  });
}

// npm failed on the host before with no detail - fallback is the standalone
// binary from GitHub releases (no root, no build step, just download + chmod).
async function installBinaryFallback() {
  if (process.platform !== "linux") throw new Error("binary fallback supports linux only, platform=" + process.platform);
  const arch = os.arch();
  const archKeys = arch === "x64" ? ["x64", "x86_64", "amd64"]
    : arch === "arm64" ? ["arm64", "aarch64"] : null;
  if (!archKeys) throw new Error("unsupported arch " + arch);
  const api = await axios.get("https://api.github.com/repos/anomalyco/opencode/releases/latest", {
    headers: { "User-Agent": "FurinaDiscordBot/1.0", "Accept": "application/vnd.github+json" },
    timeout: 30000
  });
  const assets = api.data?.assets || [];
  const match = assets.find(a => {
    const n = String(a.name || "").toLowerCase();
    return n.includes("linux") && archKeys.some(k => n.includes(k));
  });
  if (!match) {
    throw new Error("no linux binary asset (saw: " + assets.map(a => a.name).join(",").slice(0, 300) + ")");
  }
  console.log("Downloading CLI asset:", match.name);
  const out = path.join(TOOLS_DIR, "opencode");
  const dl = await axios.get(match.browser_download_url, {
    responseType: "stream",
    timeout: 180000,
    headers: { "User-Agent": "FurinaDiscordBot/1.0" }
  });
  await new Promise((res, rej) => {
    const writer = fs.createWriteStream(out, { mode: 0o755 });
    dl.data.pipe(writer);
    writer.on("finish", res);
    writer.on("error", rej);
    dl.data.on("error", rej);
  });
  try {
    fs.chmodSync(out, 0o755);
  } catch {}
}

let installing = null;
function ensureCli() {
  if (resolveCli()) return Promise.resolve(false);
  if (installing) return installing;
  installing = (async () => {
    try {
      fs.mkdirSync(TOOLS_DIR, { recursive: true });
      fs.mkdirSync(WORK_DIR, { recursive: true });
    } catch {}
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    try {
      await runCmd(npm, ["install", "--prefix", TOOLS_DIR, "opencode-ai"], 300000);
    } catch (npmErr) {
      console.error("npm CLI install failed:", npmErr.message);
      console.error("Trying standalone binary fallback...");
      await installBinaryFallback();
    }
    if (!resolveCli()) throw new Error("CLI install produced no binary (see logs above)");
    return true;
  })();
  installing.catch(() => { installing = null; });
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
    const bin = resolveCli();
    if (!bin) throw new Error("CLI binary missing after install");
    execFile(bin, ["run", "-m", MODEL, safePrompt], {
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
      await ensureCli();
    } catch (err) {
      console.error("CLI install failed:", err.message);
      return interaction.editReply("AI engine install failed - check host logs.");
    }

    try {
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
