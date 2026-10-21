# Mở 4 cửa sổ Chrome, mỗi cửa sổ một hồ sơ (profile) riêng để đăng nhập 4 tài khoản game.
# Dùng: mo-4-cua-so.bat           -> mở cả 4, xếp 2x2
#       mo-4-cua-so.bat 2         -> chỉ mở cửa sổ số 2
#       thêm -DryRun để chỉ in lệnh, không mở
param(
  [int]$Only = 0,
  [switch]$DryRun
)

$GameUrl = "https://volamidle.pages.dev/"
$Count = 4

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
  Write-Host 'Chrome not found. Edit the $chrome variable in this file.' -ForegroundColor Red
  exit 1
}

# Mỗi hồ sơ lưu ở đây, giữ nguyên đăng nhập giữa các lần mở
$root = Join-Path $env:LOCALAPPDATA "VolamProfiles"

Add-Type -AssemblyName System.Windows.Forms
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$w = [int]($wa.Width / 2)
$h = [int]($wa.Height / 2)

for ($i = 1; $i -le $Count; $i++) {
  if ($Only -gt 0 -and $i -ne $Only) { continue }
  $col = ($i - 1) % 2
  $row = [math]::Floor(($i - 1) / 2)
  $x = $wa.X + $col * $w
  $y = $wa.Y + $row * $h
  $dir = Join-Path $root "acc$i"
  $chromeArgs = @(
    "--user-data-dir=`"$dir`"",
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    "--window-position=$x,$y",
    "--window-size=$w,$h",
    $GameUrl
  )
  if ($DryRun) {
    Write-Host "`"$chrome`" $($chromeArgs -join ' ')"
  } else {
    Start-Process -FilePath $chrome -ArgumentList $chromeArgs
    Start-Sleep -Milliseconds 600
  }
}
