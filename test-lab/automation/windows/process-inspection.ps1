param([Parameter(Mandatory = $true)][int]$ProcessId)

$ErrorActionPreference = 'Stop'
$all = Get-CimInstance Win32_Process
$ids = New-Object System.Collections.Generic.HashSet[int]
[void]$ids.Add($ProcessId)
do {
  $changed = $false
  foreach ($item in $all) {
    if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $changed = $true }
  }
} while ($changed)

$result = foreach ($id in $ids) {
  $process = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($process) {
    [pscustomobject]@{
      pid = $process.Id
      name = $process.ProcessName
      responding = [bool]$process.Responding
      hasWindow = ($process.MainWindowHandle -ne 0)
      windowTitle = [string]$process.MainWindowTitle
      workingSet = [long]$process.WorkingSet64
    }
  }
}
[pscustomobject]@{
  rootPid = $ProcessId
  running = @($result).Count -gt 0
  processes = @($result)
  window = @($result | Where-Object { $_.hasWindow } | Select-Object -First 1)[0]
} | ConvertTo-Json -Depth 4 -Compress
