$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$stateFile=Join-Path $root 'work/dev-processes.json'
if(Test-Path $stateFile){Write-Host 'ตรวจสอบระบบเดิมที่ http://127.0.0.1:5173 หากหยุดแล้วให้รัน stop-dev.ps1 ก่อนเริ่มใหม่';return}
if(Get-NetTCPConnection -LocalPort 8080,5173 -State Listen -ErrorAction SilentlyContinue){throw 'Port 8080 or 5173 already in use. Stop existing development processes first.'}
$pg=Join-Path $root 'work/tools/pgsql/bin'
& (Join-Path $pg 'pg_isready.exe') -h 127.0.0.1 -p 55432 | Out-Null
if($LASTEXITCODE -ne 0){& (Join-Path $pg 'pg_ctl.exe') -D (Join-Path $root 'work/pgdata') -l (Join-Path $root 'work/postgres.log') -o '-p 55432 -h 127.0.0.1' start}
$backend=Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $root 'scripts/start-local.ps1')+'"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'work/backend.log') -RedirectStandardError (Join-Path $root 'work/backend-error.log') -PassThru
$frontend=Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c','npm.cmd run dev') -WorkingDirectory (Join-Path $root 'frontend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'work/frontend.log') -RedirectStandardError (Join-Path $root 'work/frontend-error.log') -PassThru
@{backend=$backend.Id;frontend=$frontend.Id;backendCreated=$backend.StartTime.ToUniversalTime().ToString('o');frontendCreated=$frontend.StartTime.ToUniversalTime().ToString('o');started=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content $stateFile
Write-Host 'TownTrack: http://127.0.0.1:5173 (รอ Backend เริ่มประมาณ 10 วินาที)'
