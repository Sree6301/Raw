Set-Location "g:\Smart Xerox Hub\SmartXeroxHub-Android"
$env:ANDROID_HOME = "C:\Users\Sree\AppData\Local\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"

Stop-Process -Name java -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

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
    Write-Host "Assembly did not output app-debug.apk" -ForegroundColor Red
}
