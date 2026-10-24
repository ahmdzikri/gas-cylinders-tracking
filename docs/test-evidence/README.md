# Submission test evidence

The brief asks for **three backend test results and two frontend test results as images**.
All five PNGs were captured on 2026-10-24. Each image shows the exact command, the result, and the
capture date and commit in the footer. The set is defined by `tests/evidence/evidence.config.json`;
the default config produces these five. Regenerate all five with `tests/evidence/generate-evidence.ps1`
(see `tests/evidence/README.md`).

| Image | Result |
|---|---|
| `backend-1-invalid-transitions.png` | 16 / 16 passed |
| `backend-2-duplicate-serial.png` | 1 / 1 passed |
| `backend-3-unicode-search.png` | 4 / 4 passed |
| `frontend-1-list-states.png` | 6 / 6 passed |
| `frontend-2-status-change.png` | 5 / 5 passed |

The commands below are the ones the generator runs. You do not need to take terminal screenshots
manually: `tests/evidence/generate-evidence.ps1` captures the output and writes each PNG under the
file name shown.

## Backend (3 images)

### 1. `backend-1-invalid-transitions.png`

```bash
cd backend
dotnet test --filter "FullyQualifiedName~InvalidTransition_Returns400_WithStatusError" --logger "console;verbosity=detailed"
```

Expected summary: `Total tests: 16`, `Passed: 16`.
Shows every invalid status pair (including same-status and anything from `Retired`) returning 400.

### 2. `backend-2-duplicate-serial.png`

```bash
cd backend
dotnet test --filter "FullyQualifiedName~Create_DuplicateDifferingOnlyByCase_Returns409" --logger "console;verbosity=detailed"
```

Expected summary: `Total tests: 1`, `Passed: 1`.
Shows that a serial differing only by case is rejected with 409.

### 3. `backend-3-unicode-search.png`

```bash
cd backend
dotnet test --filter "FullyQualifiedName~ListTests.Search_IsUnicodeCaseInsensitive" --logger "console;verbosity=detailed"
```

Expected summary: `Total tests: 4`, `Passed: 4`.
Shows case-insensitive search for `Café` and `Ünggul`, which SQLite's built-in `lower()` cannot fold.

## Frontend (2 images)

Each frontend image combines real screenshots of the running app with the vitest output for that file.

### 1. `frontend-1-list-states.png`

```bash
cd web
bunx vitest run src/routes/cylinders/cylinders-list.test.tsx --reporter=verbose
```

Expected summary: `Tests 6 passed (6)`.
Shows rows from the API, both empty states, the error state with retry, page size, and page past the end.

### 2. `frontend-2-status-change.png`

```bash
cd web
bunx vitest run src/components/cylinders/status-change-dialog.test.tsx --reporter=verbose
```

Expected summary: `Tests 5 passed (5)`.
Shows allowed transitions, the required customer name for `Delivered`, the confirmation step, and the
final state for `Retired`.

## Notes

- The generator runs each command separately, so each image contains one result set, not the whole suite.
- Backend PNGs are rendered from the captured terminal output; each shows the exact command.
- Frontend PNGs combine Chrome screenshots of the running app with the vitest output.
- The full backend suite is `cd backend && dotnet test` (146 tests).
- The full frontend suite is `cd web && bun run test`; run `bun run gen` first on a fresh clone.
- If an image is hard to read, open it at full size rather than cropping the test name.
