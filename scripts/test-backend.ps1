$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$secrets=Get-Content (Join-Path $root 'work/local-env.json') | ConvertFrom-Json
foreach($p in $secrets.PSObject.Properties){[Environment]::SetEnvironmentVariable($p.Name,[string]$p.Value,'Process')}
$env:DEV_UNSCANNED_FILES='true'
$env:JAVA_HOME=(Get-ChildItem (Join-Path $root 'work/tools/jdk') -Directory | Select-Object -First 1).FullName
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
& (Join-Path $root 'work/tools/apache-maven-3.9.11/bin/mvn.cmd') -B -f (Join-Path $root 'backend/pom.xml') test
exit $LASTEXITCODE
