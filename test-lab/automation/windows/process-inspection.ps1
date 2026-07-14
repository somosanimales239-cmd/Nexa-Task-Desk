param(
  [Parameter(Mandatory = $true)][int]$ProcessId
)

$ErrorActionPreference = 'Stop'
$process = Get-Process -Id $ProcessId -ErrorAction Stop
[pscustomobject]@{
  pid = $process.Id
  name = $process.ProcessName
  responding = $process.Responding
  hasWindow = ($process.MainWindowHandle -ne 0)
  windowTitle = [string]$process.MainWindowTitle
  workingSet = [long]$process.WorkingSet64
} | ConvertTo-Json -Compress
