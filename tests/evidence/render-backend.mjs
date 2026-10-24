import { chromium } from "playwright-core"
import fs from "node:fs"
import path from "node:path"

import {
  chromePath,
  ensureDir,
  escapeHtml,
  gitCommit,
  loadConfig,
  readText,
  resolveOutDir,
  saveCard,
  today,
  workDir,
} from "./lib/common.mjs"

const config = loadConfig()
const outDir = resolveOutDir(config)
const sdk = process.env.SDK_VERSION ?? "8.0.x"
const commit = gitCommit()
const date = today()
const items = config.backend

if (items.length === 0) {
  console.log("No backend cases in config; skipping backend images.")
  process.exit(0)
}

const seen = new Set()
const seenPngs = new Set()
for (const item of items) {
  for (const key of ["id", "png", "title", "filter"]) {
    if (!item[key]) throw new Error(`backend case is missing "${key}": ${JSON.stringify(item)}`)
  }
  if (seen.has(item.id)) throw new Error(`duplicate backend id: ${item.id}`)
  if (seenPngs.has(item.png)) throw new Error(`duplicate backend png: ${item.png}`)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id)) throw new Error(`invalid backend id: ${item.id}`)
  if (!/^[a-z0-9][a-z0-9-]*\.png$/.test(item.png)) throw new Error(`invalid png name: ${item.png}`)
  seen.add(item.id)
  seenPngs.add(item.png)
}

function classify(line) {
  if (/Failed|FAIL|\u00d7/.test(line)) return "bad"
  if (/^Total tests:|^\s+(Passed|Failed):|^Test Files|^\s+Tests\s|^Total time:|^\s+Duration/.test(line))
    return "sum"
  if (/Passed|\u2713|Test Run Successful|passed/.test(line)) return "ok"
  if (/^RUN\s/.test(line)) return "muted"
  return ""
}

const browser = await chromium.launch({ executablePath: chromePath(config), headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()
ensureDir(outDir)

try {
  for (const [index, item] of items.entries()) {
    const file = path.join(workDir, "raw", `${item.id}.display.txt`)
    if (!fs.existsSync(file)) {
      throw new Error(`Missing ${file}. Run generate-evidence.ps1 first.`)
    }

    const lines = readText(file)
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")

    const body = lines
      .map((line) => {
        const cls = classify(line)
        return cls ? `<span class="${cls}">${escapeHtml(line)}</span>` : escapeHtml(line)
      })
      .join("\n")

    const command = `dotnet test --filter "${item.filter}" --logger "console;verbosity=detailed"`
    const kicker = `BACKEND TEST ${index + 1} / ${items.length}`
    const footer = `GasCylinders.Api.Tests | net8.0 | SDK ${sdk} | commit ${commit} | captured ${date} | rendered from captured output`

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin:0; background:#0b1220; padding:40px; font-family:"Segoe UI",system-ui,sans-serif; }
  .card { max-width:1500px; margin:0 auto; background:#0f172a; border:1px solid #22304a; border-radius:14px;
          overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.45); }
  .head { padding:26px 30px 20px; border-bottom:1px solid #1e2b42; }
  .kicker { font-size:12px; letter-spacing:.16em; color:#60a5fa; font-weight:700; }
  h1 { margin:8px 0 0; color:#f8fafc; font-size:22px; font-weight:650; letter-spacing:-.01em; }
  .cmd { padding:16px 30px; background:#0b1220; border-bottom:1px solid #1e2b42;
         font-family:Consolas,"Cascadia Mono",monospace; font-size:13.5px; line-height:1.7; color:#93c5fd; }
  .prompt { color:#64748b; }
  pre { margin:0; padding:24px 30px 28px; color:#dbe4f0; font-family:Consolas,"Cascadia Mono",monospace;
        font-size:13.5px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }
  .ok { color:#4ade80; }
  .bad { color:#f87171; }
  .sum { color:#f8fafc; font-weight:700; }
  .muted { color:#94a3b8; }
  .foot { padding:14px 30px 18px; border-top:1px solid #1e2b42; color:#64748b; font-size:12px; }
</style></head><body><div class="card">
  <div class="head"><div class="kicker">${escapeHtml(kicker)}</div><h1>${escapeHtml(item.title)}</h1></div>
  <div class="cmd"><span class="prompt">PS&gt;</span> cd backend<br><span class="prompt">PS&gt;</span> ${escapeHtml(command)}</div>
  <pre>${body}</pre>
  <div class="foot">${escapeHtml(footer)}</div>
</div></body></html>`

    await page.setContent(html, { waitUntil: "load" })
    await saveCard(page, path.join(outDir, item.png))
    console.log("wrote", item.png)
  }
} finally {
  await browser.close()
}
