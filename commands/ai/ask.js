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
  const banned = ["desktop", ".deb", ".rpm", ".dmg", ".exe", ".msi", ".zip", ".tar.", ".tgz"];
  const match = assets.find(a => {
    const n = String(a.name || "").toLowerCase();
    return n.includes("linux") && archKeys.some(k => n.includes(k)) && !banned.some(b => n.includes(b));
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

function isMusl() {
  try {
    if (fs.existsSync("/etc/alpine-release")) return true;
    return fs.readdirSync("/lib").some(f => f.includes("ld-musl"));
  } catch {
    return false;
  }
}

function verifyBin(bin) {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 30000 }, (err, stdout) => {
      resolve(!err && String(stdout || "").trim().length > 0);
    });
  });
}

function findBinIn(pkgDir) {
  const found = [];
  (function walk(dir, depth) {
    if (depth > 4) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p, depth + 1);
      } else if (/^opencode(\.exe)?$/i.test(e.name)) {
        found.push(p);
      }
    }
  })(pkgDir, 0);
  return found;
}

async function tryNpmVariant(pkg) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await runCmd(npm, ["install", "--prefix", TOOLS_DIR, pkg], 300000);
  for (const bin of findBinIn(path.join(TOOLS_DIR, "node_modules", pkg))) {
    try {
      fs.chmodSync(bin, 0o755);
    } catch {}
    if (await verifyBin(bin)) return bin;
  }
  return null;
}

let installing = null;
function ensureCli() {
  if (installing) return installing;
  installing = (async () => {
    try {
      fs.mkdirSync(TOOLS_DIR, { recursive: true });
      fs.mkdirSync(WORK_DIR, { recursive: true });
    } catch {}
    // Drop any stale/broken binary (e.g. the .deb downloaded earlier).
    const existing = resolveCli();
    if (existing && !(await verifyBin(existing))) {
      console.error("Removing broken CLI binary:", existing);
      try {
        fs.unlinkSync(existing);
      } catch {}
    }
    if (resolveCli()) return true;
    // The generic wrapper can't detect this container's libc/CPU, so try
    // the platform variants in order and keep the first one that runs.
    const musl = isMusl();
    console.error("musl libc detected:", musl);
    const archBit = os.arch() === "arm64" ? "arm64" : "x64";
    const suffixes = musl
      ? ["-musl", "-baseline-musl", "", "-baseline"]
      : ["", "-baseline", "-musl", "-baseline-musl"];
    for (const sfx of suffixes) {
      const pkg = `opencode-linux-${archBit}${sfx}`;
      try {
        console.error("Trying CLI package:", pkg);
        const bin = await tryNpmVariant(pkg);
        if (bin) {
          const dest = path.join(TOOLS_DIR, "opencode");
          try {
            fs.copyFileSync(bin, dest);
            fs.chmodSync(dest, 0o755);
          } catch {}
          console.error("CLI ready:", dest);
          return true;
        }
      } catch (e) {
        console.error("Package", pkg, "failed:", String(e.message).slice(0, 300));
      }
    }
    console.error("npm variants exhausted, trying release-asset fallback...");
    await installBinaryFallback();
    const finalBin = resolveCli();
    if (finalBin && await verifyBin(finalBin)) return true;
    try {
      if (finalBin) fs.unlinkSync(finalBin);
    } catch {}
    throw new Error("CLI install produced no working binary (see logs above)");
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
