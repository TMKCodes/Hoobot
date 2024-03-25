@echo off

REM Check if NVM_HOME environment variable is set (indicating nvm is installed)
if not "%NVM_HOME%"=="" (
    echo nvm is already installed.
    goto :check_node
)

REM Define the source URL
set "sourceUrl=https://github.com/coreybutler/nvm-windows/releases/download/1.1.11/nvm-setup.exe"

REM Define the destination path to save the file using the USERPROFILE environment variable
set "destinationPath=%USERPROFILE%\Downloads\nvm-setup.exe"

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

:: Define URLs
set ZIP_URL=https://hoosat.fi/hoobot/hoobot-latest.zip
set TMP_DIR=C:\Temp\hoobot
set ZIP_FILE=hoobot-latest.zip

REM Create a backup of .env file
if exist .env (
    copy .env .env_backup >nul
    echo .env file backed up
)

:: Step 1: Download the zip folder
powershell -command "& { (New-Object Net.WebClient).DownloadFile('%ZIP_URL%', '%ZIP_FILE%') }"

:: Step 2: Create tmp directory if it doesn't exist
if not exist "%TMP_DIR%" mkdir "%TMP_DIR%"

:: Step 3: Extract the zip folder to tmp
powershell -command "& { Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%TMP_DIR%' }"

:: Step 4: Move the directory
move "%TMP_DIR%\Hoobot-*" "%TMP_DIR%\hoobot"

:: Step 5: Copy the files
xcopy /Y /S /E "%TMP_DIR%\hoobot\*" .\

:: Step 6: Remove the downloaded zip file and tmp folder
del %ZIP_FILE%
rmdir /S /Q %TMP_DIR%
echo Update completed successfully.

REM Install project dependencies with NPM
echo Installing project dependencies...
npm install
npm run postinstall

echo Hoobot installation completed successfully.

pause
