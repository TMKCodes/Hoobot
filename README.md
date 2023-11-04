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

### API Keys
- `API_KEY`: Your Binance API key.
- `API_SECRET`: Your Binance API secret.

### License
- `LICENSE`: License key for the bot.

### Mode, Symbols, and Candlestick Interval, Console Update
- `MODE`: Trading mode (e.g., "algorithmic").
- `SYMBOLS`: Comma-separated list of trading pairs (e.g., "ETH/TUSD, BNB/USDT").
- `CANDLESTICK_INTERVAL`: Time interval for candlestick data. Allowed values: "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M"
- `CONSOLE_UPDATE` The interval how often console should be updated with candlesticks. "update" once every candlestick update, "final" only final candlesticks.

### Source Price for Indicators
- `SOURCE`: Source price for indicators. Allowed values "open", "close", "high", "low"

### Indicators
- `USE_EMA`: Use Exponential Moving Average (true/false).
- `USE_MACD`: Use Moving Average Convergence Divergence (true/false).
- `USE_RSI`: Use Relative Strength Index (true/false).
- `USE_SMA`: Use Simple Moving Average (true/false).
- `USE_ATR`: Use Average True Range (true/false).
- `USE_BOLLINGER_BANDS`: Use Bollinger Bands (true/false).
- `USE_STOCHASTIC_OSCILLATOR`: Use Stochastic Oscillator (true/false).
- `USE_STOCHASTIC_RSI`: Use Stochastic RSI (true/false).

### SMA Parameters
- `SMA_LENGTH`: Length of Simple Moving Average.

### EMA Parameters
- `EMA_SHORT`: Length of Short Exponential Moving Average.
- `EMA_LONG`: Length of Long Exponential Moving Average.

### MACD Parameters
- `MACD_FAST`: Fast length for Moving Average Convergence Divergence.
- `MACD_SLOW`: Slow length for Moving Average Convergence Divergence.
- `MACD_SIGNAL`: Signal length for Moving Average Convergence Divergence.

### RSI Parameters
- `RSI_LENGTH`: Length of Relative Strength Index.
- `RSI_SMOOTHING`: Smoothing factor for RSI.
- `RSI_SMOOTHING_TYPE`: Type of smoothing for RSI.
- `RSI_HISTORY_LENGTH`: Length of RSI history.
- `RSI_OVERBOUGHT_TRESHOLD`: RSI overbought threshold.
- `RSI_OVERSOLD_TRESHOLD`: RSI oversold threshold.

### ATR Parameters
- `ATR_LENGTH`: Length of Average True Range.

### Bollinger Bands Parameters
- `BOLLINGER_BANDS_LENGTH`: Length of Bollinger Bands.
- `BOLLINGER_BANDS_MULTIPLIER`: Multiplier for Bollinger Bands.
- `BOLLINGER_BANDS_AVERAGE_TYPE`: Type of average for Bollinger Bands, Allowed options "SMA" | "EMA"

### Stochastic Oscillator Parameters
- `STOCHASTIC_OSCILLATOR_KPERIOD`: K period for Stochastic Oscillator.
- `STOCHASTIC_OSCILLATOR_DPERIOD`: D period for Stochastic Oscillator.
- `STOCHASTIC_OSCILLATOR_SMOOTHING`: Smoothing factor for Stochastic Oscillator.
- `STOCHASTIC_OSCILLATOR_OVERBOUGHT_TRESHOLD`: Stochastic Oscillator overbought threshold.
- `STOCHASTIC_OSCILLATOR_OVERSOLD_TRESHOLD`: Stochastic Oscillator oversold threshold.

### Stochastic RSI Parameters
- `STOCHASTIC_RSI_LENGTH_RSI`: Length of RSI for Stochastic RSI.
- `STOCHASTIC_RSI_LENGTH_STOCHASTIC`: Length of Stochastic for Stochastic RSI.
- `STOCHASTIC_RSI_SMOOTH_K`: Smoothing factor for Stochastic RSI K.
- `STOCHASTIC_RSI_SMOOTH_D`: Smoothing factor for Stochastic RSI D.
- `STOCHASTIC_RSI_OVERBOUGHT_TRESHOLD`: Stochastic RSI overbought threshold.
- `STOCHASTIC_RSI_OVERSOLD_TRESHOLD`: Stochastic RSI oversold threshold.

### Trading Limits
- `MAX_AMOUNT`: Maximum amount to trade (0 for unlimited).
- `CLOSE_PERCENTAGE`: Percentage to close a position.
- `MAX_ORDER_AGE_SECONDS`: Maximum age of an order in seconds.
- `TRADE_FEE_PERCENTAGE`: Trading fee percentage.
- `HOLD_UNTIL_POSITIVE_TRADE`: Hold position until it's profitable (true/false).
- `MINIMUM_PROFIT_SELL`: Minimum profit percentage to sell.
- `MINIMUM_PROFIT_BUY`: Minimum profit percentage to buy.

### Discord Configuration
- `DISCORD_ENABLED`: Enable Discord notifications (true/false).
- `DISCORD_BOT_TOKEN`: Discord bot token.
- `DISCORD_APPLICATION_ID`: Discord application ID.
- `DISCORD_SERVER_ID`: Discord server ID.
- `DISCORD_CHANNEL_ID`: Discord channel ID.

### OpenAI GPT Configuration
- `OPENAI_API_KEY`: Enable GPT trade decisions when this is not undefined.
- `OPENAI_MODEL`: GPT Model "gpt-4.0" | "gpt-3.5-turbo".
- `OPENAI_HISTORY_LENGTH`: Length of history sent to GPT.

### Developer
- `DEBUG`: Enable debugging mode (true/false).

### Arbitrage
- `PAIR_MIN_VOLUME`: Minimum trading volume for arbitrage.
- `PAIR_MIN_PRICE_CHANGE`: Minimum price change for arbitrage.

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