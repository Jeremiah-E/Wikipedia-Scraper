# Rename the terminal tab to "Local Server"
$host.UI.RawUI.WindowTitle = "Local Server"

# Navigate to the directory where index.html is located
$scriptDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
Set-Location $scriptDir

# Ensure Python is installed
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python is not installed or not added to PATH. Please install Python first." -ForegroundColor Red
    exit 1
}

# Start a Python HTTP server
Write-Host "Starting localhost server at http://localhost:8000..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Yellow
python -m http.server 8000
