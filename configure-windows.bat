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

REM Install project dependencies with NPM
echo Installing project dependencies...
npm install
npm run postinstall

echo Hoobot installation completed successfully.

pause
