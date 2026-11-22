Add-Type -AssemblyName System.Drawing

$assetsDirs = @(
    "windows-agent\Assets",
    "customer-web\public",
    "admin-dashboard\public"
)

foreach ($dir in $assetsDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
}

$width = 512
$height = 512
$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Background Rounded Gradient
$bgRect = New-Object System.Drawing.Rectangle(16, 16, 480, 480)
$linGrBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, [System.Drawing.Color]::FromArgb(2, 132, 199), [System.Drawing.Color]::FromArgb(15, 23, 42), 45.0)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 80
$path.AddArc(16, 16, $radius, $radius, 180, 90)
$path.AddArc(496 - $radius, 16, $radius, $radius, 270, 90)
$path.AddArc(496 - $radius, 496 - $radius, $radius, $radius, 0, 90)
$path.AddArc(16, 496 - $radius, $radius, $radius, 90, 90)
$path.CloseFigure()

$g.FillPath($linGrBrush, $path)

# Outer border
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(56, 189, 248), 6)
$g.DrawPath($borderPen, $path)

# Paper base
$paperRect = New-Object System.Drawing.Rectangle(156, 75, 200, 160)
$g.FillRectangle([System.Drawing.Brushes]::White, $paperRect)
$g.DrawRectangle((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(203, 213, 225), 3)), $paperRect)

# Folded corner on paper
$foldPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$foldPath.AddLine(316, 75, 356, 115)
$foldPath.AddLine(316, 115, 356, 115)
$foldPath.CloseFigure()
$g.FillPath([System.Drawing.Brushes]::LightGray, $foldPath)

# Printer Tray Main Base
$trayRect = New-Object System.Drawing.Rectangle(116, 195, 280, 150)
$trayBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($trayRect, [System.Drawing.Color]::FromArgb(241, 245, 249), [System.Drawing.Color]::FromArgb(203, 213, 225), 90.0)
$g.FillRectangle($trayBrush, $trayRect)
$g.DrawRectangle((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 116, 139), 4)), $trayRect)

# Output Paper Tray slot
$slotRect = New-Object System.Drawing.Rectangle(156, 275, 200, 40)
$slotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30, 41, 59))
$g.FillRectangle($slotBrush, $slotRect)

# Cyan Laser Scan Beam
$laserPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(6, 182, 212), 8)
$g.DrawLine($laserPen, 90, 205, 422, 205)

# Emerging Sheet
$outSheet = New-Object System.Drawing.Rectangle(176, 290, 160, 90)
$g.FillRectangle([System.Drawing.Brushes]::White, $outSheet)
$g.DrawRectangle((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(148, 163, 184), 2)), $outSheet)

# Text lines on emerging sheet
$linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 116, 139), 3)
$g.DrawLine($linePen, 196, 310, 316, 310)
$g.DrawLine($linePen, 196, 330, 296, 330)
$g.DrawLine($linePen, 196, 350, 276, 350)

# Bottom Typography
$titleFont = New-Object System.Drawing.Font('Arial', 24, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font('Arial', 13, [System.Drawing.FontStyle]::Bold)
$textBrush = [System.Drawing.Brushes]::White
$accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(56, 189, 248))

$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center

$g.DrawString('SMART XEROX HUB', $titleFont, $textBrush, 256, 405, $sf)
$g.DrawString('PRINT • XEROX • SCAN', $subFont, $accentBrush, 256, 445, $sf)

$bmp.Save("windows-agent\Assets\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save("customer-web\public\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save("admin-dashboard\public\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Smart Xerox Hub Logo successfully generated!"

# Generate app.ico
$thumb = New-Object System.Drawing.Bitmap($bmp, 64, 64)
$hIcon = $thumb.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$icoStream = New-Object System.IO.FileStream("windows-agent\Assets\app.ico", [System.IO.FileMode]::Create)
$icon.Save($icoStream)
$icoStream.Close()
Write-Output "app.ico generated!"
