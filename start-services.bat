@echo off
setlocal enabledelayedexpansion

:: Get current folder path (relative to the batch script location)
set WORKSPACE_DIR=%~dp0
set WORKSPACE_DIR=%WORKSPACE_DIR:~0,-1%

:: 1. Check if .env exists. If not, guide user through first-time setup
if not exist "!WORKSPACE_DIR!\.env" (
    echo ===================================================
    echo   [Welcome] Claude Code DeepSeek Proxy Setup
    echo ===================================================
    echo.
    set /p USER_KEY="Please enter your DEEPSEEK_API_KEY: "
    echo DEEPSEEK_API_KEY=!USER_KEY!> "!WORKSPACE_DIR!\.env"
    echo.
    echo Configuration saved to .env file!
    echo ===================================================
)

:: Load configuration from .env file
for /f "usebackq tokens=1,2 delims==" %%i in ("!WORKSPACE_DIR!\.env") do (
    set %%i=%%j
)

:: 2. Auto-detect Windows System Proxy
echo [System] Checking Windows proxy settings...
for /f "tokens=3" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable 2^>nul') do (
    set PROXY_ENABLE=%%a
)
for /f "tokens=3" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer 2^>nul') do (
    set PROXY_SERVER=%%a
)

:: Check if proxy is enabled (0x1 in registry means enabled)
if "!PROXY_ENABLE!"=="0x1" (
    if not "!PROXY_SERVER!"=="" (
        :: Auto-set HTTP_PROXY/HTTPS_PROXY if they are not already set in .env
        if "!HTTP_PROXY!"=="" (
            set HTTP_PROXY=http://!PROXY_SERVER!
            set HTTPS_PROXY=http://!PROXY_SERVER!
            echo [Proxy] Auto-detected active Windows proxy: http://!PROXY_SERVER!
        )
    )
) else (
    echo [Proxy] Windows system proxy is disabled.
)

:: Validate API key
if "!DEEPSEEK_API_KEY!"=="" (
    echo [ERROR] DEEPSEEK_API_KEY is not defined. Please configure it in the .env file!
    pause
    exit /b 1
)

echo ===================================================
echo [1/2] Starting DeepSeek Reasoning Proxy on Port 4001...
echo ===================================================
start "DeepSeek Reasoning Proxy" cmd /k "node \"!WORKSPACE_DIR!\deepseek_reasoning_proxy.js\""

echo ===================================================
echo [2/2] Starting LiteLLM Proxy on Port 4000...
echo ===================================================
start "LiteLLM Proxy" cmd /k "litellm --config \"!WORKSPACE_DIR!\litellm_config.yaml\" --port 4000"

echo ===================================================
echo Services started! Keep the terminal windows open.
echo You can now run Claude Code or configure Cursor/VS Code.
echo ===================================================
pause
