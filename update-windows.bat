@echo off

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

REM Install project dependencies with NPM
echo Installing project dependencies...
npm install

echo Update completed successfully.
