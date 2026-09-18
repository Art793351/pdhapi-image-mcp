#!/usr/bin/env pwsh
#requires -version 5.1

$ErrorActionPreference = 'Stop'

$REPO = "Art793351/pdhapi-image-mcp"
$MIN_NODE_MAJOR = 22
$MIN_NODE_MINOR = 19
$MIN_NODE_PATCH = 0

Write-Host "PdhAPI Image MCP Installer"
Write-Host ""

# Check Node.js version
try {
    $nodeVersion = (node -v) -replace '^v', ''
    $parts = $nodeVersion -split '\.'
    $nodeMajor = [int]$parts[0]
    $nodeMinor = [int]$parts[1]
    $nodePatch = [int]$parts[2]
} catch {
    Write-Host "Error: Node.js is not installed." -ForegroundColor Red
    Write-Host "Please install Node.js $MIN_NODE_MAJOR.$MIN_NODE_MINOR.$MIN_NODE_PATCH or later from https://nodejs.org/"
    exit 1
}

if (($nodeMajor -lt $MIN_NODE_MAJOR) -or
    (($nodeMajor -eq $MIN_NODE_MAJOR) -and ($nodeMinor -lt $MIN_NODE_MINOR)) -or
    (($nodeMajor -eq $MIN_NODE_MAJOR) -and ($nodeMinor -eq $MIN_NODE_MINOR) -and ($nodePatch -lt $MIN_NODE_PATCH))) {
    Write-Host "Error: Node.js version $nodeVersion is too old." -ForegroundColor Red
    Write-Host "Please upgrade to Node.js $MIN_NODE_MAJOR.$MIN_NODE_MINOR.$MIN_NODE_PATCH or later."
    exit 1
}

Write-Host "✓ Node.js $nodeVersion detected" -ForegroundColor Green
Write-Host ""

# Determine installation source
if (($args.Count -ge 2) -and ($args[0] -eq "--local") -and (Test-Path $args[1])) {
    $packagePath = $args[1]
    Write-Host "Installing from local package: $packagePath"
} elseif ($env:PDHAPI_INSTALL_VERSION) {
    $version = $env:PDHAPI_INSTALL_VERSION
    Write-Host "Downloading version $version from GitHub..."
    $downloadUrl = "https://github.com/$REPO/releases/download/v$version/pdhapi-image-mcp-$version.tgz"
    $checksumUrl = "https://github.com/$REPO/releases/download/v$version/SHA256SUMS"

    $tempDir = Join-Path $env:TEMP "pdhapi-install-$(New-Guid)"
    New-Item -ItemType Directory -Path $tempDir | Out-Null

    try {
        $packageFile = Join-Path $tempDir "package.tgz"
        $checksumFile = Join-Path $tempDir "SHA256SUMS"

        Invoke-WebRequest -Uri $downloadUrl -OutFile $packageFile -UseBasicParsing
        Invoke-WebRequest -Uri $checksumUrl -OutFile $checksumFile -UseBasicParsing

        Write-Host "Verifying checksum..."
        $checksumContent = Get-Content $checksumFile
        $expectedHash = ($checksumContent | Select-String "pdhapi-image-mcp-$version.tgz").Line -split '\s+' | Select-Object -First 1

        $actualHash = (Get-FileHash -Path $packageFile -Algorithm SHA256).Hash.ToLower()

        if ($actualHash -ne $expectedHash) {
            Write-Host "Error: Checksum mismatch!" -ForegroundColor Red
            Write-Host "Expected: $expectedHash"
            Write-Host "Actual:   $actualHash"
            exit 1
        }

        Write-Host "✓ Checksum verified" -ForegroundColor Green
        $packagePath = $packageFile
    } catch {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        throw
    }
} else {
    Write-Host "Error: No installation source specified." -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  1. Install from GitHub release:"
    Write-Host "     `$env:PDHAPI_INSTALL_VERSION='0.2.1'; .\install.ps1"
    Write-Host ""
    Write-Host "  2. Install from local package:"
    Write-Host "     .\install.ps1 --local .\pdhapi-image-mcp-0.2.1.tgz"
    exit 1
}

Write-Host ""
Write-Host "Installing package globally..."
npm install -g $packagePath

if ($tempDir -and (Test-Path $tempDir)) {
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "✓ Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Save your PdhAPI key to a private file (e.g., C:\Users\YourName\.pdhapi\api-key.txt)"
Write-Host "  2. Run: pdhapi-image-mcp install --client codex --key-file C:\path\to\key.txt"
Write-Host "     (Replace 'codex' with 'claude' or 'cursor' if needed)"
Write-Host "  3. Restart your MCP client"
Write-Host ""
