param([string]$ArchiveName = 'DailyDigest-source-2026-11-21-branding.zip')
$ErrorActionPreference = 'Stop'
if ($ArchiveName -notmatch '^DailyDigest-source-[a-zA-Z0-9-]+\.zip$') { throw 'Invalid archive filename.' }
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceBoundary = $sourceRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$manifestPath = Join-Path $sourceRoot 'output/handoff/source-verification.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if (-not $manifest.complete) { throw 'Run scripts/verify-source-tree.mjs and fix incomplete source first.' }
$outputDirectory = Join-Path $sourceRoot 'output/handoff'
$archivePath = Join-Path $outputDirectory $ArchiveName
$historyPath = Join-Path $outputDirectory 'DailyDigest-history.bundle'
& git -C $sourceRoot bundle create $historyPath --all
if ($LASTEXITCODE -ne 0) { throw 'Git history bundle failed.' }
& git -C $sourceRoot bundle verify $historyPath
if ($LASTEXITCODE -ne 0) { throw 'Git history bundle verification failed.' }
$extras = @('source-verification.json', 'working-tree.patch', 'DailyDigest-history.bundle')
if (-not ([IO.Path]::GetFullPath($archivePath).StartsWith($sourceBoundary, [StringComparison]::OrdinalIgnoreCase))) { throw 'Archive path outside workspace.' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [IO.File]::Open($archivePath, [IO.FileMode]::Create, [IO.FileAccess]::ReadWrite)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
    foreach ($file in $manifest.files) {
        $absolute = [IO.Path]::GetFullPath((Join-Path $sourceRoot $file.path))
        if (-not $absolute.StartsWith($sourceBoundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Source path outside workspace.' }
        if ((Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw "Source changed since audit: $($file.path)" }
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $absolute, $file.path.Replace('\', '/'), [IO.Compression.CompressionLevel]::Optimal)
    }
    foreach ($name in $extras) {
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $outputDirectory $name), ('handoff/' + $name), [IO.Compression.CompressionLevel]::Optimal)
    }
} finally { $archive.Dispose(); $stream.Dispose() }
$checksum = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $outputDirectory 'source-archive.sha256') -Value "$checksum  $([IO.Path]::GetFileName($archivePath))" -Encoding ascii
$check = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    if ($check.Entries.Count -ne $manifest.files.Count + $extras.Count) { throw 'Archive entry count mismatch.' }
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        foreach ($file in $manifest.files) {
            $entry = $check.GetEntry($file.path.Replace('\', '/'))
            if ($null -eq $entry) { throw "Archive entry missing: $($file.path)" }
            $entryStream = $entry.Open()
            try { $actual = [Convert]::ToHexString($hasher.ComputeHash($entryStream)).ToLowerInvariant() }
            finally { $entryStream.Dispose() }
            if ($actual -ne $file.sha256) { throw "Archive content mismatch: $($file.path)" }
        }
    } finally { $hasher.Dispose() }
    [pscustomobject]@{ Archive = $archivePath; Entries = $check.Entries.Count; VerifiedFiles = $manifest.files.Count; Bytes = (Get-Item -LiteralPath $archivePath).Length; SHA256 = $checksum }
} finally { $check.Dispose() }
