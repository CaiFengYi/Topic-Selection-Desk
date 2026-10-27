[CmdletBinding()]
param([int]$Port = 8765)

$ErrorActionPreference = 'Stop'
$pythonPath = Join-Path $PSScriptRoot 'TrendRadar/.venv/Scripts/python.exe'
Push-Location -LiteralPath $PSScriptRoot
try {
    & $pythonPath -m topic_workbench --port $Port
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
