[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $OutputEncoding
$env:UV_CACHE_DIR = Join-Path $PSScriptRoot '.uv-cache'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
$env:PYTHONUNBUFFERED = '1'
$env:LITELLM_TELEMETRY = 'false'
$envFile = (Join-Path $PSScriptRoot '.env.local').Replace('\', '/')
if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Missing local configuration: $envFile"
}
if (-not $Arguments) { $Arguments = @('doctor') }
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'TrendRadar')
try {
    & uv run --frozen --python 3.12 --env-file $envFile python (Join-Path $PSScriptRoot 'research-validation.py') @Arguments
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
