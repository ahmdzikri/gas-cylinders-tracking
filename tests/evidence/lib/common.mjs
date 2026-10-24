import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

export const evidenceDir = path.resolve(here, "..")
export const repoRoot = process.env.EVIDENCE_REPO
  ? path.resolve(process.env.EVIDENCE_REPO)
  : path.resolve(evidenceDir, "..", "..")
export const workDir = process.env.EVIDENCE_WORK
  ? path.resolve(process.env.EVIDENCE_WORK)
  : path.join(evidenceDir, ".work")
export const configPath = process.env.EVIDENCE_CONFIG
  ? path.resolve(process.env.EVIDENCE_CONFIG)
  : path.join(evidenceDir, "evidence.config.json")

export function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`)
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
  config.settings ??= {}
  config.scenes ??= {}
  config.backend ??= []
  config.frontend ??= []

  if (!Array.isArray(config.backend)) throw new Error("config.backend must be an array")
  if (!Array.isArray(config.frontend)) throw new Error("config.frontend must be an array")
  if (typeof config.scenes !== "object" || config.scenes === null) {
    throw new Error("config.scenes must be an object")
  }

  return config
}

export function resolveOutDir(config) {
  const dir = config.settings.outputDir ?? "docs/test-evidence"
  return path.isAbsolute(dir) ? dir : path.join(repoRoot, dir)
}

export function chromePath(config) {
  const candidates = [
    config?.settings?.chromePath,
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean)

  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (!found) {
    throw new Error("Chrome not found. Set CHROME_PATH to the Chrome executable.")
  }
  return found
}

export function gitCommit() {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT
  try {
    return execSync("git describe --always --dirty", { cwd: repoRoot, encoding: "utf8" }).trim()
  } catch {
    return "unknown"
  }
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function readText(file) {
  return fs
    .readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\u001b\[[0-9;]*m/g, "")
}

export function writeText(file, value) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, value, "utf8")
}

export function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export async function saveCard(page, file) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      if (fs.existsSync(file)) fs.rmSync(file, { force: true })
      await page.locator(".card").screenshot({ path: file })
      return
    } catch (error) {
      if (attempt === 5) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }
}
