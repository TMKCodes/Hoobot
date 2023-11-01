@echo off

REM Check if NVM_HOME environment variable is set (indicating nvm is installed)
if not "%NVM_HOME%"=="" (
    echo nvm is already installed.
    goto :check_node
)

REM Define the source URL
set "sourceUrl=https://github.com/coreybutler/nvm-windows/releases/download/1.1.11/nvm-setup.exe"

REM Define the destination path to save the file
set "destinationPath=C:\Users\tonil\Downloads\nvm-setup.exe"  REM Change this path as needed

REM Create the destination directory if it doesn't exist
mkdir "%USERPROFILE%\Downloads" 2>nul

REM Download the file
powershell -Command "& { Invoke-WebRequest -Uri '%sourceUrl%' -OutFile '%destinationPath%' }"

REM Check if the download was successful
if exist "%destinationPath%" (
    echo nvm-setup.exe downloaded successfully to %destinationPath%
    
    REM Execute the installer
    echo Installing nvm...
    powershell -Command "Start-Process -FilePath '%destinationPath%' -ArgumentList '/silent' -Wait"

    echo nvm installation complete.

) else (
    echo Failed to download nvm-setup.exe
)

:check_node
REM Check if Node.js v18.17.0 is installed
nvm list | find "18.17.0" >nul
if %ERRORLEVEL% EQU 0 (
    echo Node.js v18.17.0 is already installed.
) else (
    REM Install Node.js v18.17.0 using nvm
    nvm install 18.17.0
    nvm use 18.17.0
)

REM Create a backup of .env file
if exist .env (
    move .env .env_backup >nul
    echo .env file backed up as .env_backup
)

REM Prompt user for .env values
set /p "API_KEY=Please enter Binance API key: "
set /p "API_SECRET=Please enter Binance API secret: "
set /p "LICENSE=Please enter Hoobot license: "
set /p "DISCORD_ENABLED=Please enter true or false to enable discord: "
set /p "DISCORD_BOT_TOKEN=Please enter discord bot token: "
set /p "DISCORD_APPLICATION_ID=Please enter discord application id: "
set /p "DISCORD_SERVER_ID=Please enter discord server id: "
set /p "DISCORD_CHANNEL_ID=Please enter discord channel id: "

REM Create the .env file with user inputs
(
  echo # Binance API
  echo API_KEY="%API_KEY%"
  echo API_SECRET="%API_SECRET%"
  echo # Hoobot license
  echo LICENSE="%LICENSE%"
  echo # Discord Bot configuration
  echo DISCORD_ENABLED="%DISCORD_ENABLED%"
  echo DISCORD_BOT_TOKEN="%DISCORD_BOT_TOKEN%"
  echo DISCORD_APPLICATION_ID="%DISCORD_APPLICATION_ID%"
  echo DISCORD_SERVER_ID="%DISCORD_SERVER_ID%"
  echo DISCORD_CHANNEL_ID="%DISCORD_CHANNEL_ID%"
) > .env

echo Configuration saved to .env file.

REM Install project dependencies with NPM
echo Installing project dependencies...
npm install

echo Hoobot installation completed successfully.

pause
