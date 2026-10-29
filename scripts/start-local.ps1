$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$secrets=Get-Content (Join-Path $root 'work/local-env.json') | ConvertFrom-Json
foreach($p in $secrets.PSObject.Properties){[Environment]::SetEnvironmentVariable($p.Name,[string]$p.Value,'Process')}
$env:DEV_UNSCANNED_FILES='true'
$java=(Get-ChildItem (Join-Path $root 'work/tools/jdk') -Directory | Select-Object -First 1).FullName+'\bin\java.exe'
Set-Location $root
& $java -jar (Join-Path $root 'backend/target/towntrack-0.1.0.jar')
