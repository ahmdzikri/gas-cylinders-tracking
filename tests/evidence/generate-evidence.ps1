param(
    [int]$Port = 0,
    [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"

$evidence = $PSScriptRoot
$repo = Split-Path (Split-Path $evidence -Parent) -Parent
$work = Join-Path $evidence ".work"
$raw = Join-Path $work "raw"
$shots = Join-Path $work "app-shots"
$publish = Join-Path $work "publish"
$backendSrc = Join-Path $work "backend-src"

$configPath = if ($env:EVIDENCE_CONFIG) {
    [IO.Path]::GetFullPath($env:EVIDENCE_CONFIG)
} else {
    Join-Path $evidence "evidence.config.json"
}
if (-not (Test-Path $configPath)) { throw "Config not found: $configPath" }
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$settings = $config.settings
$backendCases = @()
if ($null -ne $config.backend) { $backendCases = @($config.backend) }
$frontendCases = @()
if ($null -ne $config.frontend) { $frontendCases = @($config.frontend) }
if (($backendCases.Count + $frontendCases.Count) -eq 0) {
    throw "Config has no backend or frontend cases: $configPath"
}

$portFromConfig = if ($null -ne $settings.port) { [int]$settings.port } else { 5199 }
$port = if ($Port -gt 0) { $Port } else { $portFromConfig }
$outputSetting = if ($settings.outputDir) { [string]$settings.outputDir } else { "docs/test-evidence" }
$outDir = if ([IO.Path]::IsPathRooted($outputSetting)) { $outputSetting } else { Join-Path $repo $outputSetting }
$expectedTotal = if ($null -ne $settings.expectedTotal) { [string]$settings.expectedTotal } else { "87" }
$base = "http://127.0.0.1:$port"

$seenIds = @{}
$seenPngs = @{}
foreach ($case in @($backendCases) + @($frontendCases)) {
    foreach ($key in @("id", "png", "title")) {
        if (-not $case.$key) { throw "Case is missing '$key': $($case | ConvertTo-Json -Compress)" }
    }
    if ($case.id -notmatch '^[a-z0-9][a-z0-9-]*$') { throw "Invalid case id: $($case.id). Use lowercase letters, digits and hyphens." }
    if ($case.png -notmatch '^[a-z0-9][a-z0-9-]*\.png$') { throw "Invalid png name: $($case.png). Use lowercase letters, digits, hyphens and .png." }
    if ($seenIds.ContainsKey($case.id)) { throw "Duplicate case id: $($case.id)" }
    if ($seenPngs.ContainsKey($case.png)) { throw "Duplicate png name: $($case.png)" }
    $seenIds[$case.id] = $true
    $seenPngs[$case.png] = $true
}
foreach ($case in $backendCases) {
    if (-not $case.filter) { throw "Backend case $($case.id) is missing 'filter'." }
}
foreach ($case in $frontendCases) {
    if (-not $case.testFile) { throw "Frontend case $($case.id) is missing 'testFile'." }
    if (-not $case.scenes -or @($case.scenes).Count -eq 0) { throw "Frontend case $($case.id) needs scenes." }
}

$env:EVIDENCE_CONFIG = $configPath
$env:EVIDENCE_TOTAL = $expectedTotal

foreach ($command in @("dotnet", "bun", "node", "git")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "$command is required but was not found in PATH."
    }
}

if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port is already in use. Pass -Port with a free port."
}

Write-Host "==> Preparing $work"
if ($SkipPublish) {
    Remove-Item $raw, $shots, $backendSrc -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $work "evidence.db*") -Force -ErrorAction SilentlyContinue
} else {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $raw, $shots, $publish, $backendSrc | Out-Null
if ($SkipPublish -and -not (Test-Path (Join-Path $publish "GasCylinders.Api.dll"))) {
    throw "-SkipPublish was used but $publish does not contain a published API. Run once without the flag."
}

Write-Host "==> Copying backend for isolated tests"
$backendTarget = Join-Path $backendSrc "backend"
if (Get-Command robocopy -ErrorAction SilentlyContinue) {
    robocopy (Join-Path $repo "backend") $backendTarget /E /XD bin obj .vs /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }
} else {
    Copy-Item (Join-Path $repo "backend") $backendTarget -Recurse
    Get-ChildItem $backendTarget -Recurse -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -in @("bin", "obj", ".vs") } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
Copy-Item (Join-Path $repo "global.json") $backendSrc -Force
New-Item -ItemType Directory -Force (Join-Path $backendSrc "docs") | Out-Null
Copy-Item (Join-Path $repo "docs/data.json") (Join-Path $backendSrc "docs") -Force

if (-not $SkipPublish) {
    Write-Host "==> Publishing API"
    & dotnet publish (Join-Path $repo "backend/GasCylinders.Api/GasCylinders.Api.csproj") -c Release -o $publish --nologo
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed." }
}

Write-Host "==> Building SPA"
Push-Location (Join-Path $repo "web")
try {
    & bun run build
    if ($LASTEXITCODE -ne 0) { throw "bun run build failed." }
} finally {
    Pop-Location
}
$wwwroot = Join-Path $publish "wwwroot"
Remove-Item $wwwroot -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $repo "web/dist") $wwwroot -Recurse

Write-Host "==> Installing evidence dependencies"
Push-Location $evidence
try {
    if (-not (Test-Path (Join-Path $evidence "node_modules/playwright-core"))) {
        & bun install
        if ($LASTEXITCODE -ne 0) { throw "bun install failed in tests/evidence." }
    }
} finally {
    Pop-Location
}

Write-Host "==> Starting API on $base"
$dbPath = Join-Path $work "evidence.db"
$env:ASPNETCORE_URLS = $base
$env:ASPNETCORE_ENVIRONMENT = "Production"
$env:ConnectionStrings__Default = 'Data Source="' + $dbPath + '"'
$api = $null
try {
    $api = Start-Process dotnet -ArgumentList "GasCylinders.Api.dll" -WorkingDirectory $publish -PassThru -WindowStyle Hidden
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if ($api.HasExited) { throw "API exited before becoming ready." }
        try {
            $health = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2
            if ($health.StatusCode -eq 200) { $ready = $true; break }
        } catch {
            # still starting
        }
    }
    if (-not $ready) { throw "API did not become ready at $base/api/health." }

    if ($frontendCases.Count -gt 0) {
        Write-Host "==> Capturing app screenshots"
        $env:EVIDENCE_REPO = $repo
        $env:EVIDENCE_WORK = $work
        $env:EVIDENCE_BASE = $base
        $env:EVIDENCE_SHOTS = $shots
        & node (Join-Path $evidence "capture-app.mjs")
        if ($LASTEXITCODE -ne 0) { throw "capture-app.mjs failed." }
    } else {
        Write-Host "==> No frontend cases; skipping app screenshots."
    }
} finally {
    if ($api -and -not $api.HasExited) {
        Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item Env:ASPNETCORE_URLS, Env:ASPNETCORE_ENVIRONMENT, Env:ConnectionStrings__Default -ErrorAction SilentlyContinue
}

Write-Host "==> Running backend evidence tests"
if ($backendCases.Count -gt 0) {
    Push-Location (Join-Path $backendSrc "backend")
    try {
        foreach ($case in $backendCases) {
            $file = Join-Path $raw ($case.id + ".txt")
            & dotnet test --nologo --filter $case.filter --logger "console;verbosity=detailed" 2>&1 |
                Out-File $file -Encoding utf8
            if ($LASTEXITCODE -ne 0) { throw "Backend evidence test failed: $($case.id)" }

            $lines = Get-Content $file |
                Where-Object {
                    ($_ -match '^\s*(Passed|Failed) ' -or
                     $_ -match '^Test Run' -or
                     $_ -match '^Total tests:' -or
                     $_ -match '^\s+(Passed|Failed):' -or
                     $_ -match '^\s*Total time:') -and
                    $_ -notmatch '^Test run for'
                }
            $lines | Set-Content (Join-Path $raw ($case.id + ".display.txt")) -Encoding utf8
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "==> No backend cases; skipping backend tests."
}

Write-Host "==> Running frontend evidence tests"
if ($frontendCases.Count -gt 0) {
    Push-Location (Join-Path $repo "web")
    try {
        foreach ($case in $frontendCases) {
            $file = Join-Path $raw ($case.id + "-output.raw.txt")
            & bun x vitest run $case.testFile --reporter=verbose 2>&1 | Out-File $file -Encoding utf8
            if ($LASTEXITCODE -ne 0) { throw "Frontend evidence test failed: $($case.id)" }

            $text = Get-Content $file -Raw
            $text = $text -replace ([char]27 + '\[[0-9;]*m'), ''
            $lines = $text -split "`r?`n" |
                Where-Object { $_ -match 'src/|Test Files|^\s*Tests\s|Duration' }
            $lines | Set-Content (Join-Path $raw ($case.id + "-output.txt")) -Encoding utf8
        }
        $version = (((& bun x vitest --version | Select-Object -Last 1).Trim()) -split '\s+')[0]
        $env:VITEST_VERSION = $version -replace '^vitest/', ''
    } finally {
        Pop-Location
    }
} else {
    Write-Host "==> No frontend cases; skipping frontend tests."
}

Write-Host "==> Rendering PNGs"
$env:EVIDENCE_REPO = $repo
$env:EVIDENCE_WORK = $work
$env:GIT_COMMIT = (& git -C $repo describe --always --dirty).Trim()
$env:SDK_VERSION = (& dotnet --version).Trim()

Push-Location $evidence
try {
    if ($backendCases.Count -gt 0) {
        & node render-backend.mjs
        if ($LASTEXITCODE -ne 0) { throw "render-backend.mjs failed." }
    }
    if ($frontendCases.Count -gt 0) {
        & node compose-frontend.mjs
        if ($LASTEXITCODE -ne 0) { throw "compose-frontend.mjs failed." }
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Evidence written to $outDir"
$pngs = @(@($backendCases) + @($frontendCases) | ForEach-Object { $_.png })
foreach ($png in $pngs) {
    $file = Join-Path $outDir $png
    if (-not (Test-Path $file)) { throw "Expected PNG not generated: $file" }
    $item = Get-Item $file
    Write-Host ("  {0,8:N0}  {1}" -f $item.Length, $item.Name)
}
Write-Host "Intermediate files are in $work (gitignored)."
