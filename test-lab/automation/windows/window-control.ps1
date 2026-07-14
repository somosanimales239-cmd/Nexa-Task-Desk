param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $false)][int]$TimeoutMs = 5000
)

$ErrorActionPreference = 'SilentlyContinue'
$process = Get-Process -Id $ProcessId
if (-not $process) { exit 0 }

if ($process.MainWindowHandle -ne 0) {
  [void]$process.CloseMainWindow()
  if ($process.WaitForExit([Math]::Max(250, $TimeoutMs))) { exit 0 }
}

taskkill.exe /PID $ProcessId /T /F | Out-Null
exit 0
