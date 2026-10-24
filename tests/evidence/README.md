# Evidence generator

Regenerates the submission images defined in `evidence.config.json`. The default config produces five images in `docs/test-evidence`:

- `backend-1-invalid-transitions.png`
- `backend-2-duplicate-serial.png`
- `backend-3-unicode-search.png`
- `frontend-1-list-states.png`
- `frontend-2-status-change.png`

The backend images are rendered from captured `dotnet test` output. The frontend images combine Playwright screenshots
of the running app with the output of the configured vitest files. Nothing is hand-drawn and no test result is typed by hand.

The set of images is defined in `evidence.config.json`. The default config produces the five images above; add or
remove entries there to change how many images are generated.

## Requirements

| Tool | Version |
|---|---|
| .NET SDK | 8.0 (the repo pins it with `global.json`) |
| bun | 1.x |
| Node.js | 20 or newer, used by the scripts |
| Chrome | installed locally, used headless by Playwright |
| PowerShell | Windows PowerShell 5.1 or PowerShell 7, for the orchestrator |

`playwright-core` is pinned in `tests/evidence/package.json`. The browser is your installed Chrome, so no browser
download is needed.

## One command

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File tests/evidence/generate-evidence.ps1
```

Optional flags:

```powershell
# use another port when 5199 is busy
powershell -ExecutionPolicy Bypass -File tests/evidence/generate-evidence.ps1 -Port 5299

# reuse an existing .work/publish folder
powershell -ExecutionPolicy Bypass -File tests/evidence/generate-evidence.ps1 -SkipPublish
```

The script:

1. copies `backend/` to `tests/evidence/.work/backend-src` so a running dev API cannot lock `bin/Debug`,
2. publishes the API in Release, builds the SPA, and copies `web/dist` into `wwwroot`,
3. starts the API on a fresh SQLite database seeded from `docs/data.json` (87 records),
4. captures the app screenshots referenced by the config with Playwright and Chrome at 1366x900,
5. stops the API, then runs the backend filters and frontend test files listed in the config,
6. renders one PNG per case into `docs/test-evidence`, with date, SDK, vitest version, and commit hash in the footer.

Intermediate files go to `tests/evidence/.work`, which is gitignored.

## Configuration

`evidence.config.json` controls the settings, the backend cases, the frontend cases, and the reusable app scenes.
The count is dynamic: the generator runs exactly the cases in `backend` and `frontend`.

```json
{
  "settings": {
    "port": 5199,
    "expectedTotal": 87,
    "outputDir": "docs/test-evidence",
    "chromePath": ""
  },
  "scenes": {
    "listObrien": { "type": "search", "term": "o'brien", "expected": 3, "file": "app-list.png" }
  },
  "backend": [
    {
      "id": "backend-1-invalid-transitions",
      "png": "backend-1-invalid-transitions.png",
      "title": "Invalid status transitions return 400",
      "filter": "FullyQualifiedName~InvalidTransition_Returns400_WithStatusError"
    }
  ],
  "frontend": [
    {
      "id": "frontend-1-list-states",
      "png": "frontend-1-list-states.png",
      "title": "List page: API rows, empty state, error retry, pagination",
      "testFile": "src/routes/cylinders/cylinders-list.test.tsx",
      "layout": "list",
      "subtitle": "Component test with a mocked API. Screenshots come from the running app seeded with 87 records.",
      "scenes": [
        { "scene": "listObrien", "role": "hero", "caption": "List with search o'brien: 3 matching rows, filtered from 87 records" }
      ]
    }
  ]
}
```

### Settings

| Key | Default | Meaning |
|---|---|---|
| `port` | `5199` | API port used by the orchestrator. Override with `-Port` |
| `expectedTotal` | `87` | Expected total rows on the list page after seeding |
| `outputDir` | `docs/test-evidence` | Destination for the PNGs, relative to the repo root |
| `chromePath` | empty | Optional Chrome executable. Empty means auto-detect |

### Backend cases

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | Unique lowercase name (letters, digits, hyphens). Also used for `raw/<id>.txt` and `raw/<id>.display.txt` |
| `png` | yes | Output file name inside `outputDir`: lowercase letters, digits, hyphens, ending `.png` |
| `title` | yes | Heading inside the image |
| `filter` | yes | Value passed to `dotnet test --filter` |

### Frontend cases

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | Unique lowercase name (letters, digits, hyphens). Also used for `raw/<id>-output.txt` |
| `png` | yes | Output file name inside `outputDir`: lowercase letters, digits, hyphens, ending `.png` |
| `title` | yes | Heading inside the image |
| `testFile` | yes | File passed to `vitest run` |
| `layout` | no | `list` or `dialog`, controls the screenshot crop |
| `subtitle` | no | Text under the heading |
| `scenes` | yes | List of `{ scene, role, caption }`. One `hero` plus 0..N `duo` |

### Scenes

| `type` | Extra fields | What it captures |
|---|---|---|
| `list` | none | The unfiltered list page |
| `search` | `term`, `expected` | Search results with the expected total |
| `noResults` | `term` | The empty result state |
| `error` | none | The error card, produced by aborting API requests |
| `status` | `step`, `status`, `targetStatus`, `customer` | Status dialog. `step: options` shows the dropdown; `step: confirm` shows the confirmation screen |

Each scene needs a unique `file` name under `.work/app-shots`, using lowercase letters, digits, hyphens, and `.png`. Scenes are captured once even if several frontend cases reference them.

### Adding or removing cases

- Add a backend image: append one object to `backend`. The generator runs the filter, writes `<id>.display.txt`, and renders `<png>`.
- Add a frontend image: append one object to `frontend` and reference existing scenes, or add new scenes. The generator runs `testFile`, writes `<id>-output.txt`, and composes `<png>`.
- Remove a case: delete its object. The count follows the arrays; a backend-only config skips the app capture, and a frontend-only config skips the backend tests.
- `id` and `png` must be unique and follow the lowercase naming rule. The generator stops with a clear error if they are not.

## Manual run on macOS or Linux

The orchestrator is PowerShell. On macOS or Linux, run the pieces directly:

```bash
cd tests/evidence && bun install

# 1. publish and build
dotnet publish ../../backend/GasCylinders.Api/GasCylinders.Api.csproj -c Release -o .work/publish
(cd ../../web && bun run build)
rm -rf .work/publish/wwwroot && cp -R ../../web/dist .work/publish/wwwroot

# 2. start the API with a fresh database
ASPNETCORE_ENVIRONMENT=Production \
ASPNETCORE_URLS=http://127.0.0.1:5199 \
ConnectionStrings__Default='Data Source=.work/evidence.db' \
dotnet .work/publish/GasCylinders.Api.dll &

# 3. capture the app
EVIDENCE_BASE=http://127.0.0.1:5199 node capture-app.mjs

# 4. capture test output, then render
#    (run the backend filters and vitest commands from the config)
#    Copy backend/ to .work/backend-src first if the dev API is running and locks bin/Debug.
EVIDENCE_REPO=../.. node render-backend.mjs
EVIDENCE_REPO=../.. node compose-frontend.mjs
```

Set `CHROME_PATH` if Chrome is not in a standard location. The scripts also accept `EVIDENCE_WORK`
and `EVIDENCE_TOTAL` (expected seed count, default `87`).

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `EVIDENCE_REPO` | two levels above this folder | repository root |
| `EVIDENCE_CONFIG` | `tests/evidence/evidence.config.json` | config file to use |
| `EVIDENCE_WORK` | `tests/evidence/.work` | intermediate captures and raw output |
| `EVIDENCE_BASE` | `http://127.0.0.1:5199` | running app URL for `capture-app.mjs` |
| `EVIDENCE_SHOTS` | `.work/app-shots` | app screenshot destination |
| `EVIDENCE_TOTAL` | `87` | expected total rows shown on the list page |
| `CHROME_PATH` | auto-detect | Chrome executable |
| `GIT_COMMIT` | `git describe --always --dirty` | value printed in the footer |
| `SDK_VERSION` | `8.0.x` | value printed in the backend footer |
| `VITEST_VERSION` | `3.2.x` | value printed in the frontend footer |

## Notes

- The frontend test files stub `fetch`, so the vitest panel shows a component test with mocked API. The screenshots
  come from the real app with the seeded database. Both facts are stated in the image footer and subtitle.
- Timings and durations change on every run. Test names and pass counts do not.
- If the working tree is dirty, the footer ends with `-dirty` (for example `670a363-dirty`). Commit the
  source changes, then rerun the generator if you need a clean commit hash in the images.
- The backend test copy avoids `bin/Debug`, so you can keep the development API running while regenerating evidence.
- If a script fails, inspect `tests/evidence/.work/raw` and the console output. The API is stopped in a `finally` block.
