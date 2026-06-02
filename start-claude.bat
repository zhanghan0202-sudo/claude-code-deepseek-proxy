@echo off
setlocal enabledelayedexpansion

:: Get current folder path (relative to the batch script location)
set WORKSPACE_DIR=%~dp0
set WORKSPACE_DIR=%WORKSPACE_DIR:~0,-1%

:: Setup environments to route through local proxy on Port 4000
set ANTHROPIC_BASE_URL=http://localhost:4000
set ANTHROPIC_AUTH_TOKEN=anything

:: Set Claude config directory to a local folder to avoid polluting system C drive
set CLAUDE_CONFIG_DIR=!WORKSPACE_DIR!\claudecode
if not exist "!CLAUDE_CONFIG_DIR!" (
    mkdir "!CLAUDE_CONFIG_DIR!"
)

echo Starting Claude Code via DeepSeek Proxy...
claude --model claude-3-5-sonnet-20241022 %*
