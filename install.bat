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
echo Please enter the Binance Bot configuration:
set /p "API_KEY=API_KEY: "
set /p "API_SECRET=API_SECRET: "
set /p "PAIR=PAIR: "
set /p "CANDLESTICK_INTERVAL=CANDLESTICK_INTERVAL: "
set /p "USE_EMA=USE_EMA: "
set /p "USE_MACD=USE_MACD: "
set /p "USE_RSI=USE_RSI: "
set /p "SHORT_EMA=SHORT_EMA: "
set /p "LONG_EMA=LONG_EMA: "
set /p "RSI_LENGTH=RSI_LENGTH: "
set /p "OVERBOUGHT_TRESHOLD=OVERBOUGHT_TRESHOLD: "
set /p "OVERSOLD_TRESHOLD=OVERSOLD_TRESHOLD: "
set /p "MAX_AMOUNT=MAX_AMOUNT: "
set /p "RISK_PERCENTAGE=RISK_PERCENTAGE: "
set /p "MAX_ORDER_AGE_SECONDS=MAX_ORDER_AGE_SECONDS: "
set /p "TRADE_FEE_PERCENTAGE=TRADE_FEE_PERCENTAGE: "

echo Please enter the Discord configuration:
set /p "DISCORD_ENABLED=DISCORD_ENABLED: "
set /p "DISCORD_BOT_TOKEN=DISCORD_BOT_TOKEN: "
set /p "DISCORD_APPLICATION_ID=DISCORD_APPLICATION_ID: "
set /p "DISCORD_SERVER_ID=DISCORD_SERVER_ID: "

REM Create the .env file with user inputs
(
  echo API_KEY="%API_KEY%"
  echo API_SECRET="%API_SECRET%"
  echo PAIR="%PAIR%"
  echo CANDLESTICK_INTERVAL="%CANDLESTICK_INTERVAL%"
  echo USE_EMA="%USE_EMA%"
  echo USE_MACD="%USE_MACD%"
  echo USE_RSI="%USE_RSI%"
  echo SHORT_EMA=%SHORT_EMA%
  echo LONG_EMA=%LONG_EMA%
  echo RSI_LENGTH=%RSI_LENGTH%
  echo OVERBOUGHT_TRESHOLD=%OVERBOUGHT_TRESHOLD%
  echo OVERSOLD_TRESHOLD=%OVERSOLD_TRESHOLD%
  echo MAX_AMOUNT=%MAX_AMOUNT%
  echo RISK_PERCENTAGE=%RISK_PERCENTAGE%
  echo MAX_ORDER_AGE_SECONDS=%MAX_ORDER_AGE_SECONDS%
  echo TRADE_FEE_PERCENTAGE=%TRADE_FEE_PERCENTAGE%

  echo DISCORD_ENABLED="%DISCORD_ENABLED%"
  echo DISCORD_BOT_TOKEN="%DISCORD_BOT_TOKEN%"
  echo DISCORD_APPLICATION_ID="%DISCORD_APPLICATION_ID%"
  echo DISCORD_SERVER_ID="%DISCORD_SERVER_ID%"
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

echo Binance trading bot installation completed successfully.