# Smart Xerox Hub - Automated Platform Extraction & APK Assembly Script
$sdkRoot = "C:\Users\Sree\AppData\Local\Android\Sdk"
$btZip = Join-Path $sdkRoot "bt34.zip"
$plZip = Join-Path $sdkRoot "pl34.zip"
$btTarget = Join-Path $sdkRoot "build-tools\34.0.0"
$plTarget = Join-Path $sdkRoot "platforms\android-34"

# Extract build-tools 34
Write-Host "Extracting build-tools 34..." -ForegroundColor Cyan
if (Test-Path "$sdkRoot\build-tools\android-14") { Remove-Item "$sdkRoot\build-tools\android-14" -Recurse -Force }
Expand-Archive -Path $btZip -DestinationPath "$sdkRoot\build-tools" -Force
if (Test-Path "$sdkRoot\build-tools\android-14") {
    if (Test-Path $btTarget) { Remove-Item $btTarget -Recurse -Force }
    Rename-Item "$sdkRoot\build-tools\android-14" "34.0.0" -Force
    Write-Host "build-tools 34.0.0 configured at $btTarget" -ForegroundColor Green
}

# Extract platform 34
Write-Host "Extracting platform 34..." -ForegroundColor Cyan
if (Test-Path $plTarget) { Remove-Item $plTarget -Recurse -Force }
Expand-Archive -Path $plZip -DestinationPath "$sdkRoot\platforms" -Force
Write-Host "platform android-34 configured at $plTarget" -ForegroundColor Green

Write-Host "Android SDK configured. Running assembleDebug..." -ForegroundColor Green
Set-Location "g:\Smart Xerox Hub\SmartXeroxHub-Android"
$env:ANDROID_HOME = $sdkRoot
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"

& "C:\Users\Sree\.gradle\gradle-8.7\bin\gradle.bat" assembleDebug --console=plain --stacktrace

$apkSource = "g:\Smart Xerox Hub\SmartXeroxHub-Android\app\build\outputs\apk\debug\app-debug.apk"
$apkDest = "g:\Smart Xerox Hub\SmartXeroxHub-Android\builds\debug\SmartXeroxHub-Admin-Debug.apk"

if (Test-Path $apkSource) {
    Copy-Item $apkSource -Destination $apkDest -Force
    Write-Host "=================================================" -ForegroundColor Green
    Write-Host "SUCCESS: SmartXeroxHub-Admin-Debug.apk Generated!" -ForegroundColor Green
    Write-Host "Location: $apkDest" -ForegroundColor Cyan
    Write-Host "File Size: $((Get-Item $apkDest).Length) bytes" -ForegroundColor Cyan
    Write-Host "SHA256: $((Get-FileHash $apkDest -Algorithm SHA256).Hash)" -ForegroundColor Cyan
    Write-Host "=================================================" -ForegroundColor Green
} else {
    Write-Host "Compilation finished. Check app/build/outputs for details." -ForegroundColor Yellow
}
