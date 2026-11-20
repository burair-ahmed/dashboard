@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Push GEX Backend to Hugging Face Spaces (Docker SDK)
echo ========================================================
echo.

cd /d "%~dp0backend"

echo [1/5] Checking Git installation...
where git >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Git is not installed or not in PATH.
    pause
    exit /b 1
)

echo [2/5] Verifying .gitignore and security rules...
if not exist ".gitignore" (
    echo .env > .gitignore
    echo __pycache__/ >> .gitignore
    echo *.pyc >> .gitignore
)

echo [3/5] Initializing Git repository if needed...
if not exist ".git" (
    git init -b main
) else (
    git branch -M main
)

echo.
echo Please enter your Hugging Face Space Git URL.
echo Example: https://huggingface.co/spaces/YOUR_USERNAME/gex-backend
echo.
set /p SPACE_URL="Enter Space Git URL: "

if "%SPACE_URL%"=="" (
    echo No URL provided. Aborting.
    pause
    exit /b 1
)

echo.
echo [4/5] Staging backend files (excluding .env)...
git add Dockerfile README.md requirements.txt app .dockerignore .gitignore

git commit -m "Deploy GEX TradingView backend service to Hugging Face Spaces"

echo [5/5] Configuring remote and pushing to Hugging Face...
git remote remove space 2>nul
git remote add space %SPACE_URL%

echo.
echo Pushing code to Hugging Face (you may be prompted for your HF token/credentials)...
git push -u space main

echo.
echo ========================================================
echo   Deployment Triggered!
echo ========================================================
echo Next steps:
echo 1. Open your Space on huggingface.co
echo 2. Go to: Settings > Variables and secrets
echo 3. Add a New Secret:
echo    Name:  ITMATRIX_API_KEY
echo    Value: itm_7a90c90c58321417180d5421e9a87c2c
echo 4. Copy your Space direct app URL:
echo    Example: https://yourusername-gex-backend.hf.space
echo 5. In Chrome, click the extension icon and paste the URL into "Backend Server", then click "Set".
echo ========================================================
echo.
pause

