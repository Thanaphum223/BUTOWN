param([string]$Destination)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if(!$Destination){$Destination=Join-Path $root ('work/backups/'+(Get-Date -Format 'yyyyMMdd-HHmmss'))}
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$s=Get-Content (Join-Path $root 'work/local-env.json') | ConvertFrom-Json
$env:PGPASSWORD=$s.DB_PASSWORD
try {
 & (Join-Path $root 'work/tools/pgsql/bin/pg_dump.exe') -h 127.0.0.1 -p 55432 -U towntrack -d towntrack -Fc -f (Join-Path $Destination 'towntrack.dump')
 if($LASTEXITCODE -ne 0){throw 'pg_dump failed'}
 Copy-Item -LiteralPath (Join-Path $root 'work/private-files') -Destination (Join-Path $Destination 'files') -Recurse
 Get-FileHash (Join-Path $Destination 'towntrack.dump') -Algorithm SHA256 | Format-List
 Write-Host ('Backup: '+$Destination)
}finally{Remove-Item Env:PGPASSWORD}
