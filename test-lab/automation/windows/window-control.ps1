param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $false)][int]$TimeoutMs = 5000
)

$ErrorActionPreference = 'SilentlyContinue'
$deadline = [DateTime]::UtcNow.AddMilliseconds([Math]::Max(250, $TimeoutMs))
$all = Get-CimInstance Win32_Process
$ids = New-Object System.Collections.Generic.HashSet[int]
[void]$ids.Add($ProcessId)
do {
  $changed = $false
  foreach ($item in $all) {
    if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $changed = $true }
  }
} while ($changed)

foreach ($id in @($ids)) {
  $process = Get-Process -Id $id
  if ($process -and $process.MainWindowHandle -ne 0) { [void]$process.CloseMainWindow() }
}
do {
  $remaining = @($ids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
  if ($remaining.Count -eq 0) { exit 0 }
  Start-Sleep -Milliseconds 150
} while ([DateTime]::UtcNow -lt $deadline)

taskkill.exe /PID $ProcessId /T /F | Out-Null
Start-Sleep -Milliseconds 300
$remaining = @($ids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
if ($remaining.Count -gt 0) { Write-Error "Processes remain active: $($remaining -join ', ')"; exit 1 }
exit 0
