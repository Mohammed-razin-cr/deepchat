Write-Host "Starting DeepChat..." -ForegroundColor DarkYellow
Set-Location "$PSScriptRoot\backend"
& "$PSScriptRoot\backend\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 3000
