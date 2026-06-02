@echo off
setlocal enabledelayedexpansion

:: Get current folder path (relative to the batch script location)
set WORKSPACE_DIR=%~dp0
set WORKSPACE_DIR=%WORKSPACE_DIR:~0,-1%

echo ===================================================
echo [1/2] Starting DeepSeek Reasoning Proxy on Port 4001...
echo ===================================================
start "DeepSeek Reasoning Proxy" cmd /k "node \"!WORKSPACE_DIR!\deepseek_reasoning_proxy.js\""

echo ===================================================
echo [2/2] Starting LiteLLM Proxy on Port 4000...
echo ===================================================

:: Load configuration from .env file if it exists
if exist "!WORKSPACE_DIR!\.env" (
    for /f "usebackq tokens=1,2 delims==" %%i in ("!WORKSPACE_DIR!\.env") do (
        set %%i=%%j
    )
)

:: Validate API key
if "!DEEPSEEK_API_KEY!"=="" (
    echo [ERROR] DEEPSEEK_API_KEY is not defined. Please configure it in the .env file!
    pause
    exit /b 1
)

:: Run LiteLLM
start "LiteLLM Proxy" cmd /k "litellm --config \"!WORKSPACE_DIR!\litellm_config.yaml\" --port 4000"

echo ===================================================
echo Services started! Keep the terminal windows open.
echo You can now run Claude Code or configure Cursor/VS Code.
echo ===================================================
pause
