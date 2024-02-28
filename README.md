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

### Xeggex
[Xeggex.com](https://xeggex.com) strives to provide its users with the best trading experience and give small and medium market cap assets a reliable trading hub. Our goal is to maintain a fast and user friendly system while also concentrating on security to keep users, data, and assets safe. Security of our users' data & assets is always our top priority and we are focused on building an easy to use digital asset trading platform for everyone to enjoy.

## How to use Hoobot

Hoobot has been programmed with Typescript on top of Node. So the requirements are node version manager (nvm), node package manager (npm) and at least Node version 18.17.0. 

### With Windows

#### Configuration and dependencies

1. Open Command Prompt with administrator privileges by searching for "cmd" in the Start menu, right-clicking on "Command Prompt," and selecting "Run as administrator."
2. Navigate to the Hoobot directory with `cd`.
3. Run the script `windows.bat` to set up the required dependencies on Windows.
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
3. Change file mode `sudo chmod +x linux.sh`.
4. Run `sudo ./linux.sh` to set up the required dependencies on Linux.
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
3. Change file ode `sudo chmod +x osx.sh`
4. Run `sudo ./osx.sh` to set up the required dependencies on OS X.
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
11. Change Hoobot settings how you want in the hoobot-options.json file.
12. Save and close the file.
13. Run command `npm run build` to build Hoobot.
13. Run command `npm run start` to start Hoobot. 

## .env Configuration Values

Below is an explanation of the various configuration values present in the `hoobot-options.json` file for the Hoobot:

```
{
  "debug": true,
  "startTime": "1698789600",
  "license": "",
  "discord": {
    "enabled": true,
    "token": "",
    "applicationId": "",
    "serverId": "",
    "channelId": ""
  },
  "exchanges": [
    {
      "name": "binance",
      "key": "",
      "secret": "",
      "mode": "algorithmic",
      "console": "trade",
      "symbols": [
        {
          "name": "BTC/USDT",
          "timeframes": ["3m"],
          "agreement": 75,
          "source": "close",
          "trend": {
            "enabled": true,
            "timeframe": "1d",
            "ema": {
              "short": 8,
              "long": 26
            }
          },
          "profit": {
            "enabled": true,
            "minimumSell": 0.15,
            "minimumBuy": 0
          },
          "growingMax": {
            "buy": 20,
            "sell": 0
          },
          "closePercentage": 0.25,
          "maximumAgeOfOrder": 60,
          "tradeFeePercentage": 0.1,
          "stopLoss": {
            "enabled": true,
            "stopTrading": false,
            "pnl": -25,
            "agingPerHour": 0.1
          },
          "takeProfit": {
            "enabled": true,
            "limit": 0.125,
            "minimum": 1.5,
            "drop": 0.05
          },
          "indicators": {
            "sma": {
              "enabled": false,
              "length": 7,
              "weight": 1
            },
            "renko": {
              "enabled": false,
              "weight": 1,
              "multiplier": 1
            },
            "ema": {
              "enabled": false,
              "short": 100,
              "long": 200,
              "weight": 1
            },
            "macd": {
              "enabled": true,
              "fast": 5,
              "slow": 15,
              "signal": 6,
              "weight": 1
            },
            "rsi": {
              "enabled": false,
              "length": 5,
              "smoothing": {
                "type": "EMA",
                "length": 12
              },
              "history": 5,
              "tresholds": {
                "overbought": 70,
                "oversold": 30
              },
              "weight": 1
            },
            "atr": {
              "enabled": false,
              "length": 14
            },
            "obv": {
              "enabled": false,
              "length": 14,
              "weight": 1
            },
            "cmf": {
              "enabled": false,
              "length": 20,
              "history": 3,
              "tresholds": {
                "overbought": 0.1,
                "oversold": 0.1
              },
              "weight": 1
            },
            "bb": {
              "enabled": false,
              "length": 20,
              "multiplier": 2,
              "average": "SMA",
              "history": 5,
              "weight": 1
            },
            "so": {
              "enabled": false,
              "kPeriod": 14,
              "dPeriod": 1,
              "smoothing": 3,
              "tresholds": {
                "overbought": 80,
                "oversold": 20
              },
              "weight": 1
            },
            "srsi": {
              "enabled": false,
              "rsiLength": 14,
              "stochLength": 14,
              "kPeriod": 14,
              "dPeriod": 1,
              "smoothK": 3,
              "smoothD": 3,
              "history": 5,
              "tresholds": {
                "overbought": 80,
                "oversold": 20
              },
              "weight": 1
            },
            "OpenAI": {
              "enabled": false,
              "key": "",
              "model": "",
              "history": "",
              "overwrite": false
            }
          }
        }
      ]
    }
  ]
} 
```

## Usage
1. Copy the provided `hoobot-options.json` file and fill in the necessary values for the parameters.
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


## Simulation

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