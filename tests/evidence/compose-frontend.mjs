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
const vitest = (process.env.VITEST_VERSION ?? "3.2.x").replace(/^vitest\//, "")
const commit = gitCommit()
const date = today()
const shots = path.join(workDir, "app-shots")
const items = config.frontend
const expectedTotal = config.settings.expectedTotal ?? 87

if (items.length === 0) {
  console.log("No frontend cases in config; skipping frontend images.")
  process.exit(0)
}

const seen = new Set()
const seenPngs = new Set()
for (const item of items) {
  for (const key of ["id", "png", "title", "testFile"]) {
    if (!item[key]) throw new Error(`frontend case is missing "${key}": ${JSON.stringify(item)}`)
  }
  if (seen.has(item.id)) throw new Error(`duplicate frontend id: ${item.id}`)
  if (seenPngs.has(item.png)) throw new Error(`duplicate frontend png: ${item.png}`)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id)) throw new Error(`invalid frontend id: ${item.id}`)
  if (!/^[a-z0-9][a-z0-9-]*\.png$/.test(item.png)) throw new Error(`invalid png name: ${item.png}`)
  seen.add(item.id)
  seenPngs.add(item.png)
  if (!Array.isArray(item.scenes) || item.scenes.length === 0) {
    throw new Error(`frontend case ${item.id} needs at least one scene`)
  }
  const heroes = item.scenes.filter((scene) => scene.role === "hero").length
  if (heroes > 1) throw new Error(`frontend case ${item.id} has more than one hero scene`)
  for (const scene of item.scenes) {
    if (!config.scenes[scene.scene]) {
      throw new Error(`frontend case ${item.id} references unknown scene: ${scene.scene}`)
    }
  }
}

function sceneData(sceneName) {
  const scene = config.scenes[sceneName]
  const file = path.join(shots, scene.file)
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}. Run capture-app.mjs first.`)
  }
  return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`
}

function outputHtml(file, command) {
  const source = path.join(workDir, "raw", file)
  if (!fs.existsSync(source)) {
    throw new Error(`Missing ${source}. Run generate-evidence.ps1 first.`)
  }

  const lines = readText(source)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")

  const body = lines
    .map((line) => {
      if (/^Test Files|^\s+Tests\s|^\s+Duration/.test(line)) {
        return `<span class="sum">${escapeHtml(line)}</span>`
      }
      if (/\u2713/.test(line)) return `<span class="ok">${escapeHtml(line)}</span>`
      return escapeHtml(line)
    })
    .join("\n")

  return `<div class="output">
    <div class="outhead">Test run</div>
    <div class="cmd"><span class="prompt">PS&gt;</span> ${escapeHtml(command)}</div>
    <pre>${body}</pre>
  </div>`
}

const browser = await chromium.launch({ executablePath: chromePath(config), headless: true })
const context = await browser.newContext({
  viewport: { width: 2000, height: 1200 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()
ensureDir(outDir)

try {
  for (const [index, item] of items.entries()) {
    const hero = item.scenes.find((scene) => scene.role === "hero")
    const duo = item.scenes.filter((scene) => scene.role !== "hero")
    const layout = item.layout === "list" ? "list" : "dialog"

    const heroHtml = hero
      ? `<figure class="hero"><img src="${sceneData(hero.scene)}"><figcaption>${escapeHtml(
          hero.caption ?? config.scenes[hero.scene].caption ?? hero.scene,
        )}</figcaption></figure>`
      : ""

    const duoHtml = duo
      .map(
        (scene) =>
          `<figure class="duo-item"><img src="${sceneData(scene.scene)}"><figcaption>${escapeHtml(
            scene.caption ?? config.scenes[scene.scene].caption ?? scene.scene,
          )}</figcaption></figure>`,
      )
      .join("")

    const command = `bunx vitest run ${item.testFile} --reporter=verbose`
    const outputFile = `${item.id}-output.txt`
    const kicker = `FRONTEND TEST ${index + 1} / ${items.length}`
    const subtitle =
      item.subtitle ??
      `Component test with a mocked API. Screenshots come from the running app seeded with ${expectedTotal} records.`
    const footer = `vitest ${vitest} | Chrome 1366x900 | commit ${commit} | captured ${date} | UI screenshots from the running app, test output from the mocked-fetch component test`

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin:0; background:#dfe7f1; padding:36px; font-family:"Segoe UI",system-ui,sans-serif; }
  .card { width:1880px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden;
          box-shadow:0 24px 70px rgba(15,23,42,.22); }
  .head { padding:28px 36px 24px; background:#0f172a; color:#f8fafc; }
  .kicker { font-size:12px; letter-spacing:.16em; color:#7dd3fc; font-weight:700; }
  h1 { margin:8px 0 6px; font-size:26px; font-weight:650; letter-spacing:-.01em; }
  .sub { color:#94a3b8; font-size:14px; }
  .shots { padding:26px 36px 8px; }
  .hero { margin:0; }
  .hero img { width:100%; height:690px; object-fit:cover; object-position:top; display:block;
              border:1px solid #cbd5e1; border-radius:12px; }
  .duo { display:grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap:18px; margin-top:18px; }
  .duo-item { margin:0; }
  .duo.list img { width:100%; height:380px; object-fit:cover; object-position:top; display:block;
                  border:1px solid #cbd5e1; border-radius:12px; }
  .duo.dialog img { width:100%; height:330px; object-fit:cover; object-position:center; display:block;
                    border:1px solid #cbd5e1; border-radius:12px; }
  figcaption { margin-top:9px; color:#475569; font-size:14px; }
  .output { margin:8px 36px 30px; background:#0b1220; border-radius:12px; padding:18px 22px 20px; }
  .outhead { color:#93c5fd; font-size:12px; letter-spacing:.14em; text-transform:uppercase; font-weight:700; }
  .cmd { margin-top:10px; color:#93c5fd; font:13px/1.6 Consolas,"Cascadia Mono",monospace; }
  .prompt { color:#64748b; }
  pre { margin:12px 0 0; color:#dbe4f0; font:13px/1.65 Consolas,"Cascadia Mono",monospace;
        white-space:pre-wrap; overflow-wrap:anywhere; }
  .ok { color:#4ade80; }
  .sum { color:#f8fafc; font-weight:700; }
  .foot { padding:0 36px 22px; color:#64748b; font-size:12px; }
</style></head><body><div class="card">
  <div class="head">
    <div class="kicker">${escapeHtml(kicker)}</div>
    <h1>${escapeHtml(item.title)}</h1>
    <div class="sub">${escapeHtml(subtitle)}</div>
  </div>
  <div class="shots">${heroHtml}<div class="duo ${layout}">${duoHtml}</div></div>
  ${outputHtml(outputFile, command)}
  <div class="foot">${escapeHtml(footer)}</div>
</div></body></html>`

    await page.setContent(html, { waitUntil: "load" })
    await saveCard(page, path.join(outDir, item.png))
    console.log("wrote", item.png)
  }
} finally {
  await browser.close()
}
