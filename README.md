# Binance Trading Bot

This repository contains a Binance trading bot designed for cryptocurrency trading. 
The bot allows you to automate trading strategies and execute trades on the Binance 
exchange.

## What is Binance.com and Crypto Trading?

[Binance.com](https://www.binance.com) is one of the world's leading cryptocurrency exchanges, offering a platform for users to buy, 
sell, and trade various cryptocurrencies. It provides a wide range of services, including spot trading, futures trading, staking, 
savings accounts, and more.

**Crypto trading** involves buying and selling cryptocurrencies with the aim of making a profit. Traders analyze market trends, 
price charts, and various technical indicators to make informed decisions about when to buy or sell a particular cryptocurrency. 
Binance provides a user-friendly interface and robust trading tools that allow both beginners and experienced traders to engage 
in crypto trading.


## NOTE: Currently only Algorithmic trading with EMA, MACD, RSI signals is available.

## Installation

### Windows

1. Run `install.bat` to set up the required dependencies on Windows.

### Linux

1. Run `install.sh` to set up the required dependencies on Linux.

## Usage

To start the trading bot, use the following command: `npm run start`

## .env Configuration Values

Below is an explanation of the various configuration values present in the `.env` file for the Binance trading bot:

### Binance Bot Configuration

- `API_KEY`: Your Binance API key, which allows the bot to access your Binance account for trading.
- `API_SECRET`: Your Binance API secret, used to sign requests for enhanced security.
- `MODE`: A string value to decide trading mode ("algorithmic", "hilow", "arbitage")
- `PAIR`: The trading pair the bot will use, e.g., "BETH/USDT" for Ethereum against USDT (Tether).
- `CANDLESTICK_INTERVAL`: The interval used for fetching candlestick data. Allowed values: "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M"
- `USE_EMA`: A boolean value ("true" or "false") indicating whether the bot should use Exponential Moving Average (EMA) in its strategy.
- `USE_MACD`: A boolean value indicating whether the bot should use Moving Average Convergence Divergence (MACD) in its strategy.
- `USE_RSI`: A boolean value indicating whether the bot should use Relative Strength Index (RSI) in its strategy.
- `SHORT_EMA`: The time period for the short-term EMA.
- `LONG_EMA`: The time period for the long-term EMA.
- `SOURCE`: A string value ("close", "open", "high", "low") indicates which value is used in EMA calculations.
- `MACD_LENGTH`: A number value indicating length for MACD signal EMA calculations.
- `RSI_LENGTH`: The time period for the RSI calculation.
- `OVERBOUGHT_THRESHOLD`: The RSI threshold for considering a cryptocurrency overbought.
- `OVERSOLD_THRESHOLD`: The RSI threshold for considering a cryptocurrency oversold.
- `MAX_AMOUNT`: The maximum amount of cryptocurrency the bot can use for trading (0 means no limit).
- `RISK_PERCENTAGE`: The percentage of the account balance the bot can risk for each trade.
- `MAX_ORDER_AGE_SECONDS`: The maximum age (in seconds) of an open order before it is canceled.
- `TRADE_FEE_PERCENTAGE`: The trading fee percentage incurred on each trade.
- `HOLD_UNTIL_POSITIVE_TRADE`: `true` to not allow negative trades.
- `MINIMUM_PROFIT_SALE`: A number value to indicate minimum profit on sale, if hold until positive trade is enabled. Can be negative value.
- `MINIMUM_PROFIT_BUY`: A number value to indicate minimum profit on buy, if hold until positive trade is enabled. Can be negative value.

### Discord Configuration

- `DISCORD_ENABLED`: A boolean value indicating whether Discord integration is enabled ("true" or "false").
- `DISCORD_BOT_TOKEN`: The Discord bot token required for the bot to connect to your Discord server.
- `DISCORD_APPLICATION_ID`: The application ID associated with the Discord bot.
- `DISCORD_SERVER_ID`: The ID of the Discord server where the bot will operate.

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

Please note that this software is provided under the Binance Trading Bot - Proprietary License, and any unauthorized use, reproduction, 
or modification is strictly prohibited. By using this software, you agree to be bound by the terms of the license.

The user of this software assumes all risks and responsibilities associated with its use. Hoosat Oy shall not be liable for any losses, 
damages, or liabilities arising from the use of this software.

## LICENSE

Binance Trading Bot - Proprietary License
Copyright (c) 2023 Hoosat Oy. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are not permitted without prior written permission 
from Hoosat Oy. Unauthorized reproduction, copying, or use of this software, in whole or in part, is strictly prohibited.

THIS SOFTWARE IS PROVIDED BY HOOSAT OY "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE, ARE DISCLAIMED. IN NO EVENT SHALL HOOSAT OY BE LIABLE FOR ANY 
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF 
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE 
USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

The user of this software uses it at their own risk. Hoosat Oy shall not be liable for any losses, damages, or liabilities 
arising from the use of this software.
