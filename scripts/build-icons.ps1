# Builds every derived image from the masters in Art/.
#
# Run from the repo root:  pwsh -File scripts/build-icons.ps1
#
# Why this exists rather than three hand-exported files: the masters are 328 KB
# to 1.4 MB, and one of them was being served *as the favicon* — the full
# 1254px, 328 KB original downloaded on every cold load, over Tailscale, to be
# drawn at 16px.
#
# Two decisions worth knowing before changing anything here.
#
# **Icons get an opaque ground.** The mark's ink is 675x1123 — a portrait shape.
# Dropped transparent into a square icon it occupies about half the width, so it
# reads as a small smudge floating in a large empty box, and on iOS transparency
# composites unpredictably. On a solid #0a0a0f the same margins become the icon
# rather than a gap in it.
#
# **The maskable variants are inset further.** Android crops a maskable icon to
# whatever shape the launcher uses, so the art sits inside the safe circle. The
# `any` icons fill more, because nothing crops them.
#
# `sharp` is not installed in this repo, hence System.Drawing.

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$art = Join-Path $root "Art"
$public = Join-Path $root "public"
$appDir = Join-Path $root "src\app"

$ground = [System.Drawing.ColorTranslator]::FromHtml("#0a0a0f")

function Get-InkBounds([System.Drawing.Bitmap]$bmp) {
    $w = $bmp.Width; $h = $bmp.Height
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bytes = New-Object byte[] ($data.Stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $bmp.UnlockBits($data)

    $minX = $w; $maxX = -1; $minY = $h; $maxY = -1
    for ($y = 0; $y -lt $h; $y++) {
        $row = $y * $data.Stride
        for ($x = 0; $x -lt $w; $x++) {
            # 24/255 rather than 0: the glow's outermost falloff is not ink, and
            # counting it would put the bounding box back where it started.
            if ($bytes[$row + $x * 4 + 3] -ge 24) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    return @{ X = $minX; Y = $minY; W = ($maxX - $minX + 1); H = ($maxY - $minY + 1) }
}

function New-Canvas([int]$w, [int]$h, $fill) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    if ($null -ne $fill) { $g.Clear($fill) } else { $g.Clear([System.Drawing.Color]::Transparent) }
    return @{ Bitmap = $bmp; Graphics = $g }
}

# A square icon: the mark's ink, scaled to `coverage` of the box, centred on the
# brand ground.
function Write-Icon([System.Drawing.Bitmap]$src, $ink, [int]$size, [double]$coverage, [string]$out) {
    $c = New-Canvas $size $size $ground
    $scale = [Math]::Min(($size * $coverage) / $ink.W, ($size * $coverage) / $ink.H)
    $dw = [int]($ink.W * $scale); $dh = [int]($ink.H * $scale)
    $dest = New-Object System.Drawing.Rectangle ([int](($size - $dw) / 2)), ([int](($size - $dh) / 2)), $dw, $dh
    $c.Graphics.DrawImage($src, $dest, $ink.X, $ink.Y, $ink.W, $ink.H, [System.Drawing.GraphicsUnit]::Pixel)
    $c.Bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $c.Graphics.Dispose(); $c.Bitmap.Dispose()
    "  {0}  {1}x{1}  {2:n0} KB" -f (Split-Path $out -Leaf), $size, ((Get-Item $out).Length / 1KB)
}

# A lockup for the UI: transparent, trimmed, scaled to a target width.
function Write-Lockup([string]$srcPath, [int]$width, [string]$out) {
    $src = [System.Drawing.Bitmap]::FromFile($srcPath)
    $ink = Get-InkBounds $src
    $h = [int]($width * $ink.H / $ink.W)
    $c = New-Canvas $width $h $null
    $dest = New-Object System.Drawing.Rectangle 0, 0, $width, $h
    $c.Graphics.DrawImage($src, $dest, $ink.X, $ink.Y, $ink.W, $ink.H, [System.Drawing.GraphicsUnit]::Pixel)
    $c.Bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $c.Graphics.Dispose(); $c.Bitmap.Dispose(); $src.Dispose()
    "  {0}  {1}x{2}  {3:n0} KB" -f (Split-Path $out -Leaf), $width, $h, ((Get-Item $out).Length / 1KB)
}

Write-Host "Icons, from Art/Steward Logo.png"
$mark = [System.Drawing.Bitmap]::FromFile((Join-Path $art "Steward Logo.png"))
$ink = Get-InkBounds $mark
Write-Host ("  ink {0}x{1} at {2},{3}" -f $ink.W, $ink.H, $ink.X, $ink.Y)

Write-Icon $mark $ink 64  0.82 (Join-Path $appDir "icon.png")
Write-Icon $mark $ink 180 0.80 (Join-Path $appDir "apple-icon.png")
Write-Icon $mark $ink 192 0.80 (Join-Path $public "icon-192.png")
Write-Icon $mark $ink 512 0.80 (Join-Path $public "icon-512.png")
# 0.58: inside Android's 80%-diameter safe circle, with room for the crop.
Write-Icon $mark $ink 192 0.58 (Join-Path $public "icon-maskable-192.png")
Write-Icon $mark $ink 512 0.58 (Join-Path $public "icon-maskable-512.png")
$mark.Dispose()

Write-Host "Lockups"
Write-Lockup (Join-Path $art "Steward Logo name below high.png") 384 (Join-Path $public "steward-lockup.png")
Write-Lockup (Join-Path $art "Steward Logo side.png") 512 (Join-Path $public "steward-side.png")
Write-Lockup (Join-Path $art "Steward Logo.png") 128 (Join-Path $public "steward-mark.png")

Write-Host "Done."
