
# Hoobot: A Comprehensive Installation & Configuration Manual

Welcome to the definitive guide for setting up and customizing Hoobot, your companion for navigating the dynamic world of cryptocurrency trading. This manual is designed to streamline the process, ensuring you're up and running with Hoobot swiftly and effectively. Let's embark on this journey together.

**Crypto trading** involves buying and selling cryptocurrencies with the aim of making a profit. Traders analyze market trends, 
price charts, and various technical indicators to make informed decisions about when to buy or sell a particular cryptocurrency. 
Binance provides a user-friendly interface and robust trading tools that allow both beginners and experienced traders to engage 
in crypto trading.

## Crypto Exchanges

### Binance

[Binance.com](https://www.binance.com/en/activity/referral-entry/CPA/together?ref=CPA_00QH6HTWLZ) is one of the world's leading cryptocurrency exchanges, offering a platform for users to buy, 
sell, and trade various cryptocurrencies. It provides a wide range of services, including spot trading, futures trading, staking, 
savings accounts, and more. 

### Xeggex
[Xeggex.com](https://xeggex.com) strives to provide its users with the best trading experience and give small and medium market cap assets a reliable trading hub. Our goal is to maintain a fast and user friendly system while also concentrating on security to keep users, data, and assets safe. Security of our users' data & assets is always our top priority and we are focused on building an easy to use digital asset trading platform for everyone to enjoy.

## How to use Hoobot

Hoobot has been programmed with Typescript on top of Node. So the requirements are node version manager (nvm), node package manager (npm) and at least Node version 18.17.0. 

## Installation

### Step 1: Download Hoobot
Begin by acquiring the latest version of Hoobot. Ensure the download is from a reputable source to avoid any security risks. Look for the file named `hoobot-latest.zip`.

### Step 2: Extract Hoobot
Once downloaded, locate the `hoobot-latest.zip` file and extract its contents. You can choose any preferred location on your device to store the Hoobot files. This location will be your working directory for Hoobot operations.

### Step 3: Install Dependencies
Dependencies are essential components that Hoobot needs to function correctly. Follow these steps tailored to your operating system:

1. **Windows Users:**
   - Navigate to the Hoobot folder in your terminal.
   - Execute the `windows.bat` file by typing `windows.bat` and pressing Enter.

2. **macOS Users:**
   - Open the terminal and change your directory to the Hoobot folder.
   - Run the command `sh osx.sh` to install the necessary dependencies.

3. **Linux Users:**
   - In the terminal, navigate to the Hoobot folder.
   - Type `sh linux.sh` and press Enter to begin the dependency installation process.

## Configuration

Configuring Hoobot is a critical step to tailor its functionality to your trading preferences and security requirements.

### Step 1: Configuration File Setup
Hoobot uses a JSON file named `hoobot-options.json` for its configuration settings. Initially, this file is named `hoobot-options.json.example` and needs to be renamed and edited. It has example configuration for running the bot.

- Locate `settings/hoobot-options.json.example` in the Hoobot folder.
- Rename this file to `hoobot-options.json`.

There is also `settigns/hoobot-options-simulation.json.example` which used for simulation. Simulation requires Binance api keys as it uses historical data from Binance.

### Step 2: Customizing Configuration Settings
Open `hoobot-options.json` with a text editor of your choice. Here, you'll specify your operational preferences, exchange details, and trading strategies.

Below is the documentation for the configuration settings provided in the JSON format. This documentation explains each parameter and its purpose, providing a clear understanding for configuring and optimizing the usage of the software or tool in question.

#### Hoobot root Level Configuration

- **`debug`**: A boolean value (`true` or `false`) indicating whether debug mode is enabled. When set to `true`, additional diagnostic information might be available for troubleshooting.
- **`startTime`**: A Unix timestamp indicating the start time for balance calculations. It represents the number of seconds since January 1, 1970, UTC.
- **`license`**: A string representing a license key for the software.
- **`discord`**: An object containing settings for Discord integration.

#### Discord Configuration

Within the `discord` object:

- **`enabled`**: A boolean value indicating whether Discord integration is enabled (`true`) or not (`false`).
- **`token`**: The bot token obtained from the Discord developer portal.
- **`applicationId`**: The application ID for the Discord bot.
- **`serverId`**: The ID of the Discord server where the bot will operate.
- **`channelId`**: The ID of the Discord channel where the bot will send messages or listen for commands.

#### Exchanges Configuration

The `exchanges` array contains objects, each representing the configuration for a specific exchange. Each object within this array includes:

- **`name`**: The name of the exchange (e.g., "binance").
- **`key`**: The API key obtained from the exchange.
- **`secret`**: The API secret obtained from the exchange.
- **`mode`**: The operating mode for the bot on the exchange. Currently, only "algorithmic" is available.
- **`console`**: Specifies how frequently the bot updates the terminal. Options include "update", "trade", "trade/final", "final", listed in order of increasing speed frequency.
- **`symbols`**: An array of objects, each representing a trading pair and its configuration.

#### Symbol Configuration

Each object within the `symbols` array includes:

###### `name`
- **Description**: The trading pair for which the configuration applies.
- **Example Value**: "HTN/USDT"

###### `timeframes`
- **Description**: An array of strings representing the trading timeframes. Each timeframe indicates how often trades should be evaluated.
- **Example Value**: ["5m"]

###### `agreement`
- **Description**: The percentage of indicator agreement required to trigger a trade. This determines how many of the enabled indicators need to agree on the trade direction.
- **Example Value**: 75

###### `source`
- **Description**: Specifies which price point should be used for indicator calculations. Options include "close", "high", "low", "open".
- **Example Value**: "close"

###### `trend`
- **Description**: Configuration for trend determination using Exponential Moving Average (EMA). It switches minimum buy and sell values based on the trend.
- **Sub Parameters**:
    - `enabled`: Whether the trend determination is enabled.
    - `timeframe`: The timeframe used for EMA signaling.
    - `ema`: EMA settings including short and long period lengths.

###### `profit`
- **Description**: Configuration for minimum profit percentage requirements for making trades.
- **Sub Parameters**:
    - `enabled`: Whether profit requirements are enabled.
    - `minimumSell`: The minimum profit percentage for sell trades.
    - `minimumBuy`: The minimum profit percentage for buy trades.

###### `price`
- **Description**: Configuration for minimum and maximum price requirements for making trades.
- **Sub Parameters**:
    - `enabled`: Whether price requirements are enabled.
    - `minimumSell`: The minimum price for sell trades.
    - `maximumSell`: The maximum price for sell trades.
    - `minimumBuy`: The minimum price for buy trades.
    - `maximumBuy`: The maximum price for buy trades.

###### `growingMax`
- **Description**: Maximum amount to trade in a single transaction. It can have different values for buy and sell actions.
- **Sub Parameters**:
    - `buy`: Maximum amount for buy transactions.
    - `sell`: Maximum amount for sell transactions.

###### `closePercentage`
- **Description**: The percentage change in price required to close an unfilled order.
- **Example Value**: 0.25

###### `maximumAgeOfOrder`
- **Description**: The maximum age of an order in minutes before it is cancelled, if unfilled.
- **Example Value**: 60

###### `tradeFeePercentage`
- **Description**: The trade fee percentage of the exchange, which is used for calculation purposes.
- **Example Value**: 0.1

###### `stopLoss`
- **Description**: Configuration for an aging stop loss mechanism, which skips profit calculations based on the settings.
- **Sub Parameters**:
    - `enabled`: Whether stop loss is enabled.
    - `stopTrading`: Whether trading should be stopped when stop loss is triggered.
    - `pnl`: The starting point of stop loss percentage.
    - `agingPerHour`: The rate at which the stop loss percentage increases per hour.

###### `takeProfit`
- **Description**: Configuration for a growing take profit indicator.
- **Sub Parameters**:
    - `enabled`: Whether take profit is enabled.
    - `limit`: The limit at which take profit calculations begin.
    - `minimum`: The growing minimum for maximum take profit.
    - `drop`: The allowable drop in unrealized PNL below the minimum before skipping profit calculations.

#### Indicators Configuration Documentation

Each indicator has a set of parameters that define its behavior and role in the trading strategy. Indicators can be enabled or disabled, and they may carry different weights which could influence their impact on the decision-making process.

###### `sma` - Simple Moving Average
- **Enabled**: Whether the SMA indicator is used.
- **Length**: The number of periods over which the average is calculated.
- **Weight**: The importance of this indicator in the overall strategy.

###### `renko`
- **Enabled**: Whether the Renko indicator is used.
- **Weight**: The importance of this indicator in the overall strategy.
- **Multiplier**: A factor used to determine the size of each Renko block.

###### `ema` - Exponential Moving Average
- **Enabled**: Whether the EMA indicator is used.
- **Short**: The period for the short EMA.
- **Long**: The period for the long EMA.
- **Weight**: The importance of this indicator in the overall strategy.

###### `macd` - Moving Average Convergence Divergence
- **Enabled**: Whether the MACD indicator is used.
- **Fast**: The period for the fast moving average.
- **Slow**: The period for the slow moving average.
- **Signal**: The period for the signal line.
- **Weight**: The importance of this indicator in the overall strategy.

###### `rsi` - Relative Strength Index
- **Enabled**: Whether the RSI indicator is used.
- **Length**: The period over which the RSI is calculated.
- **Smoothing**: The method and length for smoothing the RSI.
- **History**: The number of periods to consider for historical analysis.
- **Tresholds**: The overbought and oversold levels.
- **Weight**: The importance of this indicator in the overall strategy.

###### `atr` - Average True Range
- **Enabled**: Whether the ATR indicator is used.
- **Length**: The period over which the ATR is calculated.

###### `obv` - On-Balance Volume
- **Enabled**: Whether the OBV indicator is used.
- **Length**: The period over which the OBV is calculated.
- **Weight**: The importance of this indicator in the overall strategy.

###### `cmf` - Chaikin Money Flow
- **Enabled**: Whether the CMF indicator is used.
- **Length**: The period over which the CMF is calculated.
- **History**: The number of periods to consider for historical analysis.
- **Tresholds**: The overbought and oversold levels.
- **Weight**: The importance of this indicator in the overall strategy.

###### `bb` - Bollinger Bands
- **Enabled**: Whether the Bollinger Bands indicator is used.
- **Length**: The period over which the bands are calculated.
- **Multiplier**: The number of standard deviations from the average.
- **Average**: The type of moving average used (e.g., SMA).
- **History**: The number of periods to consider for historical analysis.
- **Weight**: The importance of this indicator in the overall strategy.

###### `so` - Stochastic Oscillator
- **Enabled**: Whether the Stochastic Oscillator is used.
- **kPeriod**: The %K line period.
- **dPeriod**: The %D line period (signal line).
- **Smoothing**: The smoothing factor for %K.
- **Tresholds**: The overbought and oversold levels.
- **Weight**: The importance of this indicator in the overall strategy.

###### `srsi` - Stochastic Relative Strength Index
- **Enabled**: Whether the Stochastic RSI is used.
- **RSILength**: The period for calculating the RSI.
- **StochLength**: The period for the stochastic calculation.
- **kPeriod**: The %K line period.
- **dPeriod**: The %D line period (signal line).
- **SmoothK**: The smoothing factor for %K.
- **SmoothD**: The smoothing factor for %D.
- **History**: The number of periods to consider for historical analysis.
- **Tresholds**: The overbought and oversold levels.
- **Weight**: The importance of this indicator in the overall strategy.

###### `OpenAI`
- **Enabled**: Whether the OpenAI indicator is used.
- **Key**: The API key for OpenAI.
- **Model**: The model used for predictions.
- **History**: The data period considered for generating predictions.
- **Overwrite**: Whether to overwrite existing configurations with OpenAI predictions.

Each indicator is designed to provide specific insights into the market's behavior, and when combined, they offer a comprehensive view to inform trading decisions.


### Step 3: Starting Hoobot
With your configurations set, it's time to launch Hoobot:

- Open a terminal and navigate to the Hoobot directory.
- Execute the command `npm run start` to initialize Hoobot.

To run the simulation:

- Open a terminal and navigate to the Hoobot directory.
- Execute the command `npm run simulate` to initialize Hoobot simulation.

### Step 4: Updating Hoobot

You can update Hoobot by running `windows.bat`, `linux.sh`, `osx.sh` again in the hoobot folder. It will check that dependancies exist and downloads always latest Hoobot for you. 

**Note:** Ensure that any symbols you intend to trade with have been actively traded (at least two trades) before employing Hoobot. Be cautious that certain exchanges like Xeggex and NonKYC may experience instability.

Through this guide, you're now equipped to install and configure Hoobot with precision. Enjoy your trading journey, knowing that Hoobot is configured to your exact specifications.


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


### Simulation

You can run simulations with command `npm run simulate`, simulations currently support symbols available from Binance and you can adjust simulation configuration from file `hoobot-options-simulate.json`. The simulate file has same format as `hoobot-options.json` but exists only to seperate simulation options from Hoobot live options. 

At the end of simulation you get results like this:
```
{
    "Starting balance": "20.00",
    "Final Balance": "2870.05",
    "ROI": "142.50",
    "BTC/USDT trades": 4037,
    "BTC/USDT stop losses": 96,
    "BTC/USDT take profits": 246,
    "BTC/USDT sells": 1745,
    "BTC/USDT buys": 1949
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