# SMART XEROX HUB - LOCAL ECOSYSTEM LAUNCH SCRIPT
# Starts Backend (Port 3001), Customer Web (Port 5173), and Admin Dashboard (Port 5174)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " STARTING SMART XEROX HUB FULL ECOSYSTEM" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Start Backend Server
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\backend'; npm start" -WindowStyle Normal

# 2. Start Customer Web App
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\customer-web'; npm run dev" -WindowStyle Normal

# 3. Start Admin Dashboard
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\admin-dashboard'; npm run dev" -WindowStyle Normal

Write-Host "Backend API:        http://localhost:3001" -ForegroundColor Green
Write-Host "Customer Web:       http://localhost:5173" -ForegroundColor Green
Write-Host "Admin Dashboard:    http://localhost:5174" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
