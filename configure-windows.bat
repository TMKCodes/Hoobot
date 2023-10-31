@echo off

REM Function to check if Node.js is installed and matches the required version (v18.17.0)
:is_node_installed
setlocal
set "required_version=v18.17.0"
where /q node
if %ERRORLEVEL% EQU 0 (
  for /f "tokens=*" %%i in ('node -v') do (
    if "%%i"=="%required_version%" (
      exit /b 0
    ) else (
      exit /b 1
    )
  )
) else (
  exit /b 1
)

REM Function to install Node.js and NPM using nvm-windows
:install_node_npm
echo Installing Node.js and NPM...
nvm install v18.17.0
nvm use v18.17.0

REM Function to install project dependencies with NPM
:install_dependencies
echo Installing project dependencies...
npm install

REM Function to prompt user for .env file information
:prompt_for_env
echo Please enter the Binance API configuration:
set /p "API_KEY=API_KEY: "
set /p "API_SECRET=API_SECRET: "
echo Please enter the Hoobot license:
set /p "LICENSE=LICENSE: "
echo Please enter the Discord configuration:
set /p "DISCORD_ENABLED=DISCORD_ENABLED: "
set /p "DISCORD_BOT_TOKEN=DISCORD_BOT_TOKEN: "
set /p "DISCORD_APPLICATION_ID=DISCORD_APPLICATION_ID: "
set /p "DISCORD_SERVER_ID=DISCORD_SERVER_ID: "
set /p "DISCORD_CHANNEL_ID=DISCORD_CHANNEL_ID: "

REM Create the .env file with user inputs
(
  echo API_KEY="%API_KEY%"
  echo API_SECRET="%API_SECRET%"
  echo LICENSE="%LICENSE%"
  echo DISCORD_ENABLED="%DISCORD_ENABLED%"
  echo DISCORD_BOT_TOKEN="%DISCORD_BOT_TOKEN%"
  echo DISCORD_APPLICATION_ID="%DISCORD_APPLICATION_ID%"
  echo DISCORD_SERVER_ID="%DISCORD_SERVER_ID%"
  echo DISCORD_CHANNEL_ID="%DISCORD_CHANNEL_ID%"
) > .env


echo Configuration saved to .env file.

REM Main script
:main
REM Check if Node.js is installed
call :is_node_installed
if %ERRORLEVEL% EQU 0 (
  echo Node.js is already installed.
) else (
  REM Check if NVM is installed
  where /q nvm
  if %ERRORLEVEL% EQU 0 (
    call :install_node_npm
  ) else (
    echo Error: nvm-windows not found. Please install nvm-windows and try again.
    exit /b 1
  )
)

REM Install project dependencies with NPM
call :install_dependencies

echo Hoobot installation completed successfully.