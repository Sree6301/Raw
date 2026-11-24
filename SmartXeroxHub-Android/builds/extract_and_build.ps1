# Smart Xerox Hub - Extract Platform 34 and Build Debug APK
$sdkRoot = "C:\Users\Sree\AppData\Local\Android\Sdk"
$plZip = Join-Path $sdkRoot "pl34.zip"
$plTargetDir = Join-Path $sdkRoot "platforms"
$androidJar = Join-Path $sdkRoot "platforms\android-34\android.jar"
$targetApk = "g:\Smart Xerox Hub\SmartXeroxHub-Android\builds\debug\SmartXeroxHub-Admin-Debug.apk"

Write-Host "Waiting for pl34.zip to reach 63180081 bytes..." -ForegroundColor Cyan
while ($true) {
    if (Test-Path $plZip) {
        $len = (Get-Item $plZip).Length
        if ($len -ge 63180081) {
            Write-Host "pl34.zip download complete ($len bytes)!" -ForegroundColor Green
            break
        }
        Write-Host "Download progress: $([math]::Round($len / 1MB, 1)) MB / 60.2 MB"
    }
    Start-Sleep -Seconds 5
}

Write-Host "Extracting platform-34 with tar.exe..." -ForegroundColor Cyan
tar.exe -xf $plZip -C $plTargetDir
if (Test-Path $androidJar) {
    Write-Host "Platform 34 extraction SUCCESSFUL! android.jar verified at $androidJar" -ForegroundColor Green
} else {
    Write-Host "ERROR: android.jar not found after extraction!" -ForegroundColor Red
    exit 1
}

Write-Host "Starting Gradle assembleDebug..." -ForegroundColor Cyan
Set-Location "g:\Smart Xerox Hub\SmartXeroxHub-Android"
$env:ANDROID_HOME = $sdkRoot
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"

& "C:\Users\Sree\.gradle\gradle-8.7\bin\gradle.bat" assembleDebug --console=plain --stacktrace

$apkSource = "g:\Smart Xerox Hub\SmartXeroxHub-Android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkSource) {
    Copy-Item $apkSource -Destination $targetApk -Force
    Write-Host "=================================================" -ForegroundColor Green
    Write-Host "SUCCESS: SmartXeroxHub-Admin-Debug.apk Generated!" -ForegroundColor Green
    Write-Host "Path: $targetApk" -ForegroundColor Cyan
    Write-Host "Size: $((Get-Item $targetApk).Length) bytes" -ForegroundColor Cyan
    Write-Host "SHA256: $((Get-FileHash $targetApk -Algorithm SHA256).Hash)" -ForegroundColor Cyan
    Write-Host "=================================================" -ForegroundColor Green
} else {
    Write-Host "Build failed to generate app-debug.apk. Check logs above." -ForegroundColor Red
    exit 1
}
