# Generate Production Keystore for Smart Xerox Hub
$keytool = "C:\Program Files\Java\jdk-17\bin\keytool.exe"
$keystorePath = Join-Path $PSScriptRoot "smartxerox-release.jks"

if (Test-Path $keystorePath) {
    Write-Host "Keystore already exists at $keystorePath" -ForegroundColor Yellow
} else {
    Write-Host "Generating release keystore at $keystorePath..." -ForegroundColor Cyan
    & $keytool -genkey -v `
      -keystore $keystorePath `
      -alias "smartxerox" `
      -keyalg RSA `
      -keysize 2048 `
      -validity 10000 `
      -dname "CN=Smart Xerox Hub, OU=Operations, O=Smart Xerox, L=Hyderabad, ST=Telangana, C=IN" `
      -storepass "smartxerox2026" `
      -keypass "smartxerox2026"
    Write-Host "Release keystore generated successfully!" -ForegroundColor Green
}
