function Write-JSXFile([string]\$path, [string]\$content) {
    \$dir = Split-Path \$path -Parent
    if (-not (Test-Path \$dir)) { New-Item -ItemType Directory -Path \$dir -Force | Out-Null }
    [System.IO.File]::WriteAllText(\$path, \$content, [System.Text.Encoding]::UTF8)
    Write-Host \"Created \\"
}

Write-Host 'Helper loaded'
