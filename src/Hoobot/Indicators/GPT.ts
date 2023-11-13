/* =====================================================================
* Hoobot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited. All 
* modifications in source or binary must be submitted to Hoosat Oy in source format.
*
* THIS SOFTWARE IS PROVIDED BY HOOSAT OY "AS IS" AND ANY EXPRESS OR
* IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL HOOSAT OY BE LIABLE FOR ANY DIRECT,
* INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
* SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
* HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
* STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
* OF THE POSSIBILITY OF SUCH DAMAGE.
*
* The user of this software uses it at their own risk. Hoosat Oy shall
* not be liable for any losses, damages, or liabilities arising from
* the use of this software.
* ===================================================================== */
import OpenAI from 'openai';
import { Candlesticks } from '../Binance/Candlesticks';
import { ConsoleLogger } from '../Utilities/consoleLogger';
import { Indicators } from '../Modes/Algorithmic';
import { ConfigOptions } from '../Utilities/args';

export const checkGPTSignals = async (
  consoleLogger: ConsoleLogger, 
  symbol: string,
  candlesticks: Candlesticks, 
  indicators: Indicators, 
  options: ConfigOptions
) => {
  symbol = symbol.split("/").join("");
  let check = "SKIP";
  if(options.openaiApiKey !== undefined && options.openaiModel !== undefined) {
    check = 'HOLD';
    const slice = options.openaiHistoryLength; 
    let message = "I give you this trade data, I want you to decide from them if I should BUY, SELL or HOLD.  Data in arrays are oldest to newest order. Please reply only with one word HOLD, BUY or SELL!\n\n";
    message += `Traded symbol is: ${symbol}\n`;
    const timeframes = Object.keys(indicators[symbol]);
    message += `Candle timeframes: ${JSON.stringify(timeframes, null, 2)}\n`;
    for (let i = 0; i < timeframes.length; i++) {
      const latestCandles = candlesticks[symbol][timeframes[i]].slice(-slice);
      const high = latestCandles.map((candle) => candle.high);
      message += `${timeframes[i]} Candle high: ${JSON.stringify(high, null, 2)}\n`;
      const low = latestCandles.map((candle) => candle.low);
      message += `${timeframes[i]} Candle low: ${JSON.stringify(low, null, 2)}\n`;
      const open = latestCandles.map((candle) => candle.open);
      message += `${timeframes[i]} Candle open: ${JSON.stringify(open, null, 2)}\n`;
      const close = latestCandles.map((candle) => candle.close);
      message += `${timeframes[i]} Candle close: ${JSON.stringify(close, null, 2)}\n`;
      const volume = latestCandles.map((candle) => candle.volume);
      message += `${timeframes[i]} Candle volume: ${JSON.stringify(volume, null, 2)}\n`;
      if (options.useEMA) {
        const emalong = indicators[timeframes[i]].ema.long.slice(-slice);
        message += `${timeframes[i]} EMA long: ${JSON.stringify(emalong, null, 2)}\n`;
        const emashort = indicators[timeframes[i]].ema.short.slice(-slice);
        message += `${timeframes[i]} EMA short: ${JSON.stringify(emashort, null, 2)}\n`;
      }
      if (options.useMACD) {
        const macdline = indicators[timeframes[i]].macd?.macdLine?.slice(-slice);
        message += `${timeframes[i]} MACD line: ${JSON.stringify(macdline, null, 2)}\n`;
        const macdsignal = indicators[timeframes[i]].macd?.signalLine.slice(-slice);
        message += `${timeframes[i]} MACD line: ${JSON.stringify(macdsignal, null, 2)}\n`;
        const macdhistogram = indicators[timeframes[i]].macd?.histogram.slice(-slice);
        message += `${timeframes[i]} MACD line: ${JSON.stringify(macdhistogram, null, 2)}\n`;
      }
      if (options.useATR) {
        const atr = indicators[timeframes[i]].atr.slice(-slice);
        message += `${timeframes[i]} ATR: ${JSON.stringify(atr, null, 2)}\n`;
      }
      if (options.useRSI) {
        const rsi = indicators[timeframes[i]].rsi.slice(-slice);
        message += `${timeframes[i]} RSI: ${JSON.stringify(rsi, null, 2)}\n`;
      }
      if (options.useBollingerBands) {
        message += `${timeframes[i]} Bollinger Bands average: ${JSON.stringify(indicators[timeframes[i]].bollingerBands[0].slice(-slice), null, 2)}\n`;
        message += `${timeframes[i]} Bollinger Bands upper: ${JSON.stringify(indicators[timeframes[i]].bollingerBands[1].slice(-slice), null, 2)}\n`;
        message += `${timeframes[i]} Bollinger Bands lower: ${JSON.stringify(indicators[timeframes[i]].bollingerBands[2].slice(-slice), null, 2)}\n`;
      }
      if (options.useStochasticOscillator) {
        message += `${timeframes[i]} Stochastic Oscillator %K: ${JSON.stringify(indicators[timeframes[i]].stochasticOscillator[0].slice(-slice), null, 2)}\n`;
        message += `${timeframes[i]} Stochastic Oscillator %D: ${JSON.stringify(indicators[timeframes[i]].stochasticOscillator[1].slice(-slice), null, 2)}\n`;
      }
      if (options.useStochasticRSI) {
        message += `${timeframes[i]} Stochastic RSI %K: ${JSON.stringify(indicators[timeframes[i]].stochasticRSI[0].slice(-slice), null, 2)}\n`;
        message += `${timeframes[i]} Stochastic RSI %D: ${JSON.stringify(indicators[timeframes[i]].stochasticRSI[1].slice(-slice), null, 2)}\n`;
      }
    }
    const openai = new OpenAI({
      apiKey: options.openaiApiKey, 
    });
    const chatCompletion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: message }],
      model: options.openaiModel,
    });
    for (let i = 0; i < chatCompletion.choices.length; i++) {
      if(chatCompletion.choices[i].message.role === "assistant") {
        if(chatCompletion.choices[i].finish_reason === "stop") {
          const content = chatCompletion.choices[i].message.content;
          if (content === "HOLD" || content === "SELL" || content === "BUY") {
            check = content
            break;
          }
        }
      }
    }
    if(options.debug === true) {
      console.log(JSON.stringify(chatCompletion, null, 2));
    }
    consoleLogger.push("GPT Check", check);
  }
  return check;
}

