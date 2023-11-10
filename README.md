# Hoobot

Hoobot is reactive algorithmic cryptocurrency trading bot. It supports multiple different indicators such as EMA, MACD and RSI for algorithmic trading.

**Crypto trading** involves buying and selling cryptocurrencies with the aim of making a profit. Traders analyze market trends, 
price charts, and various technical indicators to make informed decisions about when to buy or sell a particular cryptocurrency. 
Binance provides a user-friendly interface and robust trading tools that allow both beginners and experienced traders to engage 
in crypto trading.

## Crypto Exchanges

### Binance

[Binance.com](https://www.binance.com/en/activity/referral-entry/CPA/together?ref=CPA_00QH6HTWLZ) is one of the world's leading cryptocurrency exchanges, offering a platform for users to buy, 
sell, and trade various cryptocurrencies. It provides a wide range of services, including spot trading, futures trading, staking, 
savings accounts, and more. 

## How to use Hoobot

Hoobot has been programmed with Typescript on top of Node. So the requirements are node version manager (nvm), node package manager (npm) and at least Node version 18.17.0. 

Here is a list of npm packages that are required:

- `discord.js`
- `dotenv`
- `node-binance-api`
- `play-sound`

### With Windows

#### Configuration and dependencies

1. Open Command Prompt with administrator privileges by searching for "cmd" in the Start menu, right-clicking on "Command Prompt," and selecting "Run as administrator."
2. Navigate to the Hoobot directory with `cd`.
3. Run the script `configure-windows.bat` to set up the required dependencies on Windows.
4. Run `npm run start` to start Hoobot.
5. Wait for profit!

#### Updating

1. Open Command Prompt with administrator privileges by searching for "cmd" in the Start menu, right-clicking on "Command Prompt," and selecting "Run as administrator."
2. Navigate to the Hoobot directory with cd.
3. Run the script update-windows.bat to check for updates and apply them if available.
4. Restart Hoobot.
5. Continue trading and monitoring for profit!

### With Linux

#### Configuration and dependencies

1. Open terminal
2. Navigate to the Hoobot directory with `cd`.
3. Change file mode `sudo chmod +x configure-linux.sh`.
4. Run `sudo ./configure-linux.sh` to set up the required dependencies on Linux.
3. Check the generated startup options in `.env` file and change them if you want to. Confirm your Hoobot license and Binance API keys.
6. Run `npm run start` to start Hoobot.
7. Wait for profit!

#### Updating

1. Open terminal
2. Navigate to the Hoobot directory with `cd`.
3. RChange the file mode `sudo chmod +x update-linux.sh`.
3. Run the script `sudo ./update-linux.sh` to check for updates and apply them if available.
4. Restart Hoobot.
5. Continue trading and monitoring for profit!

### With OS X 

#### Configuration and dependencies

1. Open terminal
2. Navigate to the Hoobot directory with `cd`.
3. Change file ode `sudo chmod +x configure-osx.sh`
4. Run `sudo ./configure-osx.sh` to set up the required dependencies on OS X.
5. Check the generated startup options in `.env` file and change them if you want to. Confirm your Hoobot license and Binance API keys.
6. Run `npm run start` to start Hoobot.
7. Wait for profit!

#### Updating

1. Open terminal
2. Navigate to the Hoobot directory with `cd`.
3. RChange the file mode `sudo chmod +x update-osx.sh`.
3. Run the script `sudo ./update-osx.sh` to check for updates and apply them if available.
4. Restart Hoobot.
5. Continue trading and monitoring for profit!

### Manually

1. Install NVM (Node Version Manager) from sh script, brew, nvm_windows, etc.
2. Download Hoobot and extract Hoobot source code from the .zip
3. Open console of your choice.
4. While in console, change directory `cd` to the extracted Hoobot folder.
5. Install Node with command `nvm install 18.17.0`
6. Use the node version with command `nvm use 18.17.0`
7. Install Hoobot dependancies with command `npm install`
8. Copy `.env_default` to `.env`, notice no `.txt` or such at the end of .env file. 
9. Open `.env` with text editor 
10. Add your Binance API keys and Hoobot License and if you want Discord API keys
11. Change Hoobot settings how you want in the .env file.
12. Save and close the file.
13. Run command `npm run start` to start Hoobot. 

## .env Configuration Values

Below is an explanation of the various configuration values present in the `.env` file for the Hoobot:

```
#Binance Bot configuration
API_KEY=""
API_SECRET=""

# Hoobot license
LICENSE=""

# Discord configuration
DISCORD_ENABLED="false"
DISCORD_BOT_TOKEN=""
DISCORD_APPLICATION_ID=""
DISCORD_SERVER_ID=""
DISCORD_CHANNEL_ID=""

# Hoobot trading mode
MODE="algorithmic"
# Symbols to trade. Supports multiple coins seperated with comma 'ETH/TUSD,BTC/TUSD'.
SYMBOLS="BTC/TUSD"
# Interval of candlesticks
CANDLESTICK_INTERVAL="15m"
# Default source of candlestick to use for calculations
SOURCE="close"
# How often to update terminal: "update", "final", "trade", "trade/final".
CONSOLE_UPDATE="trade/final"

# Simple Moving Average configuration
USE_SMA="false"
SMA_LENGTH=7

# Exponetial Moving Average configuration
USE_EMA="false"
EMA_SHORT=20
EMA_LONG=50

# Moving average convergence/divergence configuration
USE_MACD="true"
MACD_FAST=5
MACD_SLOW=15
MACD_SIGNAL=6

# Relative Strength Index configuration
USE_RSI="false"
RSI_LENGTH=5
RSI_SMOOTHING=12
RSI_SMOOTHING_TYPE="EMA"
RSI_HISTORY_LENGTH=5
RSI_OVERBOUGHT_TRESHOLD=70
RSI_OVERSOLD_TRESHOLD=30

# Average True Range configuration
USE_ATR="false"
ATR_LENGTH=14

# On-Balance Volume configuration
USE_OBV="false"
OBV_HISTORY_LENGTH=5

# Chaikin Money Flow configuration
USE_CMF="true"
CMF_LEGNTH=20
CMF_HISTORY_LENGTH=5
CMF_OVERBOUGHT_TRESHOLD=0.25
CMF_OVERSOLD_TRESHOLD=-0.25

# Bollinger Bands configuration
USE_BOLLINGER_BANDS="false"
BOLLINGER_BANDS_LENGTH=20
BOLLINGER_BANDS_MULTIPLIER=2
BOLLINGER_BANDS_AVERAGE_TYPE="SMA"
BOLLINGER_BANDS_HISTORY_LENGTH=5

# Stochastic Oscillator configuration
USE_STOCHASTIC_OSCILLATOR="false"
STOCHASTIC_OSCILLATOR_KPERIOD=14
STOCHASTIC_OSCILLATOR_DPERIOD=1
STOCHASTIC_OSCILLATOR_SMOOTHING=3
STOCHASTIC_OSCILLATOR_OVERBOUGHT_TRESHOLD=80
STOCHASTIC_OSCILLATOR_OVERSOLD_TRESHOLD=20

# Stochastic RSI configuration
USE_STOCHASTIC_RSI="true"
STOCHASTIC_RSI_LENGTH_RSI=14
STOCHASTIC_RSI_LENGTH_STOCHASTIC=14
STOCHASTIC_RSI_SMOOTH_K=3
STOCHASTIC_RSI_SMOOTH_D=3
STOCHASTIC_RSI_OVERBOUGHT_TRESHOLD=80
STOCHASTIC_RSI_OVERSOLD_TRESHOLD=20
STOCHASTIC_RSI_HISTORY_LENGTH=5

# Growing MAX buy and sell amount for quote coin.
STARTING_MAX_BUY_AMOUNT=5.3
STARTING_MAX_SELL_AMOUNT=0

# Percentage of price change when to cancel order 
CLOSE_PERCENTAGE=0.25

# Maximum age of order, cancel afterwwards
MAX_ORDER_AGE_SECONDS=60

# Trade fee 
TRADE_FEE_PERCENTAGE=0.075

# Panic sell configuration, leave 0 for disabling.
PANIC_PROFIT_MINIMUM=0.4
PANIC_PROFIT_MINIMUM_DROP=0.05

# Don't allow trading until these PNL are met. False to disable
HOLD_UNTIL_POSITIVE_TRADE="true"
MINIMUM_PROFIT_SELL=0.075
MINIMUM_PROFIT_BUY=-0.075

# Go crazy, enable trading on all symbols with given quote coin.
GO_CRAZY="TUSD"

# Developer
DEBUG="true"

# Trading start date in unix timestamp
START_TIMESTAMP="1698789600"
```

## Usage
1. Copy the provided `.env` file and fill in the necessary values for the parameters.
2. Save the file in your project directory.
3. Use the configuration in your bot code.

### force.json

Force.json is a file where you can force allow negative trade for one trade as in force skip holding until positive trade. For example if your bot sells too quickly and it needs to buy with negative trade. Then you can flip the switch in the json for the symbol. The skip value will be automatically changed back to false after the negative trade.

```
{
  "BNBUSDT": {
    "skip": true
  },
  "ETHTUSD": {
    "skip": false
  }
}
```

## Funds low? 

Try bitcoin faucets like [freebitcoin](https://freebitco.in/?r=36740494), there you can win $200 worth of bitcoin every hour. 

## Tax Reporting

For tax reporting purposes, we recommend using Koinly, a tool that helps with cryptocurrency tax reports. You can find more information 
about Koinly and sign up through the following link: [Koinly - Cryptocurrency Tax Software](https://koinly.io/?via=66701C69&utm_source=friend)

## Note

Please note that this software is provided under the Hoobot - Proprietary License, and any unauthorized use, reproduction, 
or modification is strictly prohibited. By using this software, you agree to be bound by the terms of the license.

The user of this software assumes all risks and responsibilities associated with its use. Hoosat Oy shall not be liable for any losses, 
damages, or liabilities arising from the use of this software.

## LICENSE

Hoobot - Proprietary License
Copyright (c) 2023 Hoosat Oy. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are not permitted without prior written permission 
from Hoosat Oy. Unauthorized reproduction, copying, or use of this software, in whole or in part, is strictly prohibited. All 
modifications in source or binary must be submitted to Hoosat Oy in source format.

THIS SOFTWARE IS PROVIDED BY HOOSAT OY "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE, ARE DISCLAIMED. IN NO EVENT SHALL HOOSAT OY BE LIABLE FOR ANY 
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF 
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE 
USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

The user of this software uses it at their own risk. Hoosat Oy shall not be liable for any losses, damages, or liabilities 
arising from the use of this software.