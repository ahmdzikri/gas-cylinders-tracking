import { chromium } from "playwright-core"
import path from "node:path"

import { chromePath, ensureDir, loadConfig, workDir } from "./lib/common.mjs"

const config = loadConfig()
const base = process.env.EVIDENCE_BASE ?? `http://127.0.0.1:${config.settings.port ?? 5199}`
const expectedTotal = String(process.env.EVIDENCE_TOTAL ?? config.settings.expectedTotal ?? 87)
const out = process.env.EVIDENCE_SHOTS
  ? path.resolve(process.env.EVIDENCE_SHOTS)
  : path.join(workDir, "app-shots")

const used = [
  ...new Set(config.frontend.flatMap((item) => (item.scenes ?? []).map((scene) => scene.scene))),
]

if (used.length === 0) {
  console.log("No frontend scenes in config; skipping app screenshots.")
  process.exit(0)
}

for (const name of used) {
  if (!config.scenes[name]) throw new Error(`Unknown scene in frontend config: ${name}`)
  if (!config.scenes[name].file) throw new Error(`Scene ${name} is missing "file"`)
  if (!/^[a-z0-9][a-z0-9-]*\.png$/.test(config.scenes[name].file)) {
    throw new Error(`Scene ${name} has an invalid file name: ${config.scenes[name].file}`)
  }
}

const seenFiles = new Set()
for (const name of used) {
  const file = config.scenes[name].file
  if (seenFiles.has(file)) throw new Error(`Duplicate scene file: ${file}`)
  seenFiles.add(file)
}

ensureDir(out)

const serialCache = new Map()
async function findSerial(status) {
  if (serialCache.has(status)) return serialCache.get(status)
  const response = await fetch(
    `${base}/api/cylinders?status=${encodeURIComponent(status)}&pageSize=1`,
  )
  if (!response.ok) {
    throw new Error(`Cannot read a ${status} cylinder from ${base}: HTTP ${response.status}`)
  }
  const item = (await response.json()).items?.[0]
  if (!item?.serialNumber) {
    throw new Error(`No ${status} cylinder found. Seed the database from docs/data.json first.`)
  }
  serialCache.set(status, item.serialNumber)
  return item.serialNumber
}

const browser = await chromium.launch({ executablePath: chromePath(config), headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })

async function openList() {
  await page.goto(base)
  await page.getByText(`Total data: ${expectedTotal}`).waitFor({ timeout: 20000 })
}

async function capture(name) {
  const scene = config.scenes[name]
  const file = path.join(out, scene.file)

  switch (scene.type) {
    case "list": {
      await openList()
      break
    }
    case "search": {
      await openList()
      await page.getByPlaceholder("Cari serial atau pelanggan...").fill(scene.term ?? "")
      await page.getByText(`Total data: ${scene.expected}`).waitFor({ timeout: 10000 })
      break
    }
    case "noResults": {
      await openList()
      await page.getByPlaceholder("Cari serial atau pelanggan...").fill(scene.term ?? "zzzz")
      await page.getByText("Tidak ada hasil").waitFor({ timeout: 10000 })
      break
    }
    case "error": {
      await page.route("**/api/cylinders**", (route) => route.abort())
      try {
        await page.goto(`${base}/cylinders`)
        await page.getByText("Gagal memuat data").waitFor({ timeout: 15000 })
        await page.screenshot({ path: file })
      } finally {
        await page.unroute("**/api/cylinders**")
      }
      console.log("captured", name)
      return
    }
    case "status": {
      const status = scene.status ?? "Filled"
      const serial = await findSerial(status)
      await page.goto(`${base}/cylinders?search=${serial}`)
      await page.getByText("Total data: 1").waitFor({ timeout: 15000 })
      await page.getByRole("button", { name: `Aksi untuk ${serial}` }).click()
      await page.getByRole("menuitem", { name: "Ubah Status" }).click()

      if (scene.step === "options") {
        await page.getByRole("combobox", { name: "Status tujuan" }).click()
        if (scene.targetStatus) {
          await page.getByRole("option", { name: scene.targetStatus }).waitFor({ timeout: 10000 })
        } else {
          await page.getByRole("option").first().waitFor({ timeout: 10000 })
        }
      } else if (scene.step === "confirm") {
        const target = scene.targetStatus ?? "Delivered"
        await page.getByRole("combobox", { name: "Status tujuan" }).click()
        await page.getByRole("option", { name: target }).click()
        if (scene.customer) {
          await page.getByPlaceholder("Nama pelanggan penerima").fill(scene.customer)
        }
        await page.getByRole("button", { name: "Lanjutkan" }).click()
        await page.getByText("Konfirmasi ubah status").waitFor({ timeout: 10000 })
      } else {
        throw new Error(`Scene ${name} has unknown status step: ${scene.step}`)
      }
      break
    }
    default:
      throw new Error(`Scene ${name} has unknown type: ${scene.type}`)
  }

  await page.screenshot({ path: file })
  console.log("captured", name)
}

try {
  for (const name of used) {
    await capture(name)
  }
  console.log(`captured ${used.length} app screenshots from ${base}`)
} finally {
  await browser.close()
}
