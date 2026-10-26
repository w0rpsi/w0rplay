param (
    [switch]$ForceKill
)

if ($ForceKill) {
    Get-Process eurotrucks2, amtrucks, W0RPLAY, w0rplay -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 800
}

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$releaseExe = Join-Path $root "target\release\w0rplay.exe"
$releaseDll = Join-Path $root "target\release\w0rplay.dll"

Write-Host "Copying W0RPLAY.exe to release-w0rplay..."
Copy-Item $releaseExe -Destination (Join-Path $root "release-w0rplay\W0RPLAY.exe") -Force

Write-Host "Copying w0rplay.dll to release-w0rplay..."
Copy-Item $releaseDll -Destination (Join-Path $root "release-w0rplay\w0rplay.dll") -Force

$ets2Plugin = "D:\SteamLibrary\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins\w0rplay.dll"
if (Test-Path (Split-Path $ets2Plugin)) {
    Write-Host "Copying w0rplay.dll to ETS2 plugins..."
    Copy-Item $releaseDll -Destination $ets2Plugin -Force
}

$atsPlugin = "D:\SteamLibrary\steamapps\common\American Truck Simulator\bin\win_x64\plugins\w0rplay.dll"
if (Test-Path (Split-Path $atsPlugin)) {
    Write-Host "Copying w0rplay.dll to ATS plugins..."
    Copy-Item $releaseDll -Destination $atsPlugin -Force
}

Write-Host "Local deployment finished successfully!" -ForegroundColor Green
