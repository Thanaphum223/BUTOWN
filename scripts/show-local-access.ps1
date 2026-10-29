$root=Split-Path $PSScriptRoot -Parent
$s=Get-Content (Join-Path $root 'work/local-env.json') | ConvertFrom-Json
Write-Host 'URL: http://127.0.0.1:5173'
Write-Host ('admin: '+$s.BOOTSTRAP_PASSWORD)
Write-Host ('citizen / officer / leader / field / approver: '+$s.DEMO_PASSWORD)
