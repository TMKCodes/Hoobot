import OpenAI from 'openai';
import { candlestick } from '../Binance/candlesticks';
import { ConsoleLogger } from '../Utilities/consoleLogger';
import { Indicators } from '../Modes/algorithmic';
import { ConfigOptions } from '../Utilities/args';



export const checkGPTSignals = async (consoleLogger: ConsoleLogger, candlesticks: candlestick[], indicators: Indicators, options: ConfigOptions) => {
  const slice = options.openaiHistoryLength; 
  let check = "HOLD";
  let message = "I give you this trade data, I want you to decide from them if I should BUY, SELL or HOLD.  Data in arrays are oldest to newest order. Please reply only with one word HOLD, BUY or SELL!\n\n";
  const latestCandles = candlesticks.slice(-slice);
  const high = latestCandles.map((candle) => candle.high);
  message += `Candle high history: $ ${JSON.stringify(high, null, 2)}\n`;
  const low = latestCandles.map((candle) => candle.low);
  message += `Candle low history: $ ${JSON.stringify(low, null, 2)}\n`;
  const open = latestCandles.map((candle) => candle.open);
  message += `Candle open history: $ ${JSON.stringify(open, null, 2)}\n`;
  const close = latestCandles.map((candle) => candle.close);
  message += `Candle close history: $ ${JSON.stringify(close, null, 2)}\n`;
  const volume = latestCandles.map((candle) => candle.volume);
  message += `Candle volume history: $ ${JSON.stringify(volume, null, 2)}\n`;
  if (options.useEMA) {
    const emalong = indicators.ema.long.slice(-slice);
    message += `EMA long history: $ ${JSON.stringify(emalong, null, 2)}\n`;
    const emashort = indicators.ema.short.slice(-slice);
    message += `EMA short history: $ ${JSON.stringify(emashort, null, 2)}\n`;
  }
  if (options.useMACD) {
    const macdline = indicators.macd?.macdLine?.slice(-slice);
    message += `MACD line history: $ ${JSON.stringify(macdline, null, 2)}\n`;
    const macdsignal = indicators.macd?.signalLine.slice(-slice);
    message += `MACD line history: $ ${JSON.stringify(macdsignal, null, 2)}\n`;
    const macdhistogram = indicators.macd?.histogram.slice(-slice);
    message += `MACD line history: $ ${JSON.stringify(macdhistogram, null, 2)}\n`;
  }
  if (options.useATR) {
    const atr = indicators.atr.slice(-slice);
    message += `ATR history: $ ${JSON.stringify(atr, null, 2)}\n`;
  }
  if (options.useRSI) {
    const rsi = indicators.rsi.slice(-slice);
    message += `RSI history: $ ${JSON.stringify(rsi, null, 2)}\n`;
  }
  if (options.useBollingerBands) {
    message += `Bollinger Bands average history: $ ${JSON.stringify(indicators.bollingerBands[0].slice(-slice), null, 2)}\n`;
    message += `Bollinger Bands upper history: $ ${JSON.stringify(indicators.bollingerBands[1].slice(-slice), null, 2)}\n`;
    message += `Bollinger Bands lower history: $ ${JSON.stringify(indicators.bollingerBands[2].slice(-slice), null, 2)}\n`;
  }
  if (options.useStochasticOscillator) {
    message += `Stochastic Oscillator %K history: $ ${JSON.stringify(indicators.stochasticOscillator[0].slice(-slice), null, 2)}\n`;
    message += `Stochastic Oscillator %D history: $ ${JSON.stringify(indicators.stochasticOscillator[1].slice(-slice), null, 2)}\n`;
  }
  if (options.useStochasticRSI) {
    message += `Stochastic RSI %K history: $ ${JSON.stringify(indicators.stochasticRSI[0].slice(-slice), null, 2)}\n`;
    message += `Stochastic RSI %D history: $ ${JSON.stringify(indicators.stochasticRSI[1].slice(-slice), null, 2)}\n`;
  }
  if (options.debug === true) {
    console.log(message);
  }
  if(options.openaiApiKey !== undefined && options.openaiModel !== undefined) {
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
  }
  return check;
}

