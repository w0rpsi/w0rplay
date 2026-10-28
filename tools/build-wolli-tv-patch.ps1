param(
    [Parameter(Mandatory=$true)][string]$OutPath,
    [string]$ModPath = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Euro Truck Simulator 2/mod/wollis_interior_addons.scs')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$utf8 = [Text.UTF8Encoding]::new($false)
$screenSource = '/tv_screen/tv_screen.tobj'
$newSource = '/w0rplay/wolli_tv_mirror.tobj'
$ddsPath = '/w0rplay/wolli_tv_mirror.dds'
$materials = [ordered]@{}
$original = [IO.Compression.ZipFile]::OpenRead($ModPath)
try {
    foreach ($entry in $original.Entries) {
        if (!$entry.FullName.EndsWith('.mat') -or $entry.Length -gt 32768) { continue }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
        if ($text.Contains($screenSource)) { $materials[$entry.FullName] = $text.Replace($screenSource, $newSource) }
    }
} finally { $original.Dispose() }
if ($materials.Count -eq 0) { throw 'This Wolli archive has no supported TV screen material.' }

# Dedicated BGRA8 sRGB texture, identified by both its dimensions and a byte signature.
# The extra column is filled by the plugin with the frame's last column: no content is cropped.
$width = 1281
$height = 720
$dds = [byte[]]::new(148 + $width * $height * 4)
[Text.Encoding]::ASCII.GetBytes('DDS ').CopyTo($dds, 0)
foreach ($field in @(@(4,124),@(8,0x100F),@(12,$height),@(16,$width),@(20,($width*4)),@(28,1),@(76,32),@(80,4),@(108,0x1000),@(128,91),@(132,3),@(140,1))) {
    [BitConverter]::GetBytes([uint32]$field[1]).CopyTo($dds, [int]$field[0])
}
[Text.Encoding]::ASCII.GetBytes('DX10').CopyTo($dds, 84)
for ($alpha = 151; $alpha -lt $dds.Length; $alpha += 4) { $dds[$alpha] = 255 }
$signature = [byte[]]@(0x57,0x30,0x54,255,0x56,0x30,0x31,255)
$signature.CopyTo($dds, 148)
$tobj = [IO.MemoryStream]::new()
$tobjHeader = [byte[]]@(0x01,0x0a,0xb1,0x70,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x01,0,0,0,0x02,0,0x01,0x01,0x02,0,0x02,0x02,0,0,0,0,0,0x01,0,0)
$tobj.Write($tobjHeader)
$tobj.Write([BitConverter]::GetBytes([uint32]$ddsPath.Length))
$tobj.Write([byte[]]::new(4))
$tobj.Write([Text.Encoding]::ASCII.GetBytes($ddsPath))
$manifest = @'
SiiNunit
{
mod_package : .w0rplay_wolli_tv_mirror
{
 package_version: "0.1"
 display_name: "W0RPLAY - Wolli TV Mirror"
 author: "W0RPLAY compatibility patch; requires Wolli2017 Interior Addon"
 category[]: "interior"
 description_file: "description.txt"
}
}
'@
$output = [IO.Path]::GetFullPath($OutPath)
[IO.Directory]::CreateDirectory((Split-Path $output -Parent)) | Out-Null
$stream = [IO.File]::Open($output, [IO.FileMode]::Create, [IO.FileAccess]::ReadWrite)
$zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
function Add-Entry([string]$Name, [byte[]]$Bytes) {
    $entry = $zip.CreateEntry($Name, [IO.Compression.CompressionLevel]::Optimal)
    $writer = $entry.Open()
    try { $writer.Write($Bytes) } finally { $writer.Dispose() }
}
try {
    Add-Entry 'manifest.sii' $utf8.GetBytes($manifest)
    Add-Entry 'description.txt' $utf8.GetBytes("Mirrors the current W0RPLAY screen onto Wolli's sleeper TV. Requires the matching W0RPLAY TV-mirror plugin and the original Interior Addon. Put above Wolli in Mod Manager. No original models/textures are included.`n")
    foreach ($path in $materials.Keys) { Add-Entry $path $utf8.GetBytes($materials[$path]) }
    Add-Entry $newSource.TrimStart('/') $tobj.ToArray()
    Add-Entry $ddsPath.TrimStart('/') $dds
} finally { $zip.Dispose(); $tobj.Dispose() }

$verify = [IO.Compression.ZipFile]::OpenRead($output)
try {
    $entry = $verify.GetEntry($ddsPath.TrimStart('/'))
    if ($entry.Length -ne $dds.Length) { throw 'Generated DDS length mismatch' }
    $reader = $entry.Open()
    try { $header = [byte[]]::new(156); $reader.ReadExactly($header) } finally { $reader.Dispose() }
    if ([BitConverter]::ToString($header,148,8) -ne [BitConverter]::ToString($signature) -or [BitConverter]::ToUInt32($header,16) -ne $width -or [BitConverter]::ToUInt32($header,12) -ne $height) { throw 'Generated TV signature/dimensions mismatch' }
} finally { $verify.Dispose() }
[ordered]@{
    output = $output
    sourceModSha256 = (Get-FileHash -LiteralPath $ModPath).Hash
    originalArchiveModified = $false
    overriddenMaterials = @($materials.Keys)
    marker = [BitConverter]::ToString($signature)
    dimensions = "$width`x$height"
    patchSha256 = (Get-FileHash -LiteralPath $output).Hash
} | ConvertTo-Json -Depth 6
