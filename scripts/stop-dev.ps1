$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$stateFile=Join-Path $root 'work/dev-processes.json'
if(!(Test-Path $stateFile)){Write-Host 'ไม่มีรายการ process ที่สคริปต์เริ่มไว้';return}
$state=Get-Content $stateFile | ConvertFrom-Json
foreach($taskPid in @($state.backend,$state.frontend)){
 $proc=Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid" -ErrorAction SilentlyContinue
 if($proc){
  $recorded=if($taskPid -eq $state.backend){$state.backendCreated}else{$state.frontendCreated}
  $expectedTime=if($recorded -is [DateTime]){$recorded.ToUniversalTime()}else{[DateTimeOffset]::Parse([string]$recorded,[Globalization.CultureInfo]::InvariantCulture).UtcDateTime}
  if([Math]::Abs(($proc.CreationDate.ToUniversalTime()-$expectedTime).TotalSeconds) -gt 1){throw 'PID was reused; refusing to stop an unrelated process'}
  # Only stop recorded processes whose command line belongs to this project.
  if($proc.CommandLine -notlike '*TownTrack*' -and $proc.CommandLine -notlike '*npm.cmd run dev*'){throw 'Recorded PID does not match expected development process'}
  function Stop-TaskTree([int]$parentPid){Get-CimInstance Win32_Process -Filter "ParentProcessId=$parentPid" | ForEach-Object {Stop-TaskTree $_.ProcessId};Stop-Process -Id $parentPid -ErrorAction SilentlyContinue}
  Stop-TaskTree $taskPid
 }
}
Remove-Item -LiteralPath $stateFile
Write-Host 'หยุด Web และ Backend แล้ว ฐานข้อมูลทดสอบยังคงเปิดอยู่'
