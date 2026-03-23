$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Convert-Path $scriptRoot
$nextBin = Join-Path $projectRoot "node_modules\\.bin\\next.cmd"

if (-not (Test-Path $nextBin)) {
  Write-Error "next.cmd not found. Run 'npm install' in the project root first."
}

Set-Location -LiteralPath $projectRoot
& $nextBin dev
