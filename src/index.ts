import Client from 'binance-api-node';
import { OrderSide, OrderType, TimeInForce } from 'binance-api-node';


type CandlestickInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";

// Get configuration options from command-line arguments
const args = process.argv.slice(2);
const options = parseArgs(args) as ConfigOptions;

// Initialize Binance client
const client = Client({ apiKey: options.apiKey, apiSecret: options.apiSecret });

// Configuration options interface
interface ConfigOptions {
  apiKey: string;
  apiSecret: string;
  pair: string;
  candlestickInterval: CandlestickInterval;
  emaA: number;
  emaB: number;
  maxAmount: number;
  [key: string]: string | number; // Index signature
}

// Main trading function
async function trade() {
  try {
    const balance = await getCurrentBalance();
    const klines = await getLastCandlesticks();

    const emaA = calculateEMA(klines, options.emaA);
    const emaB = calculateEMA(klines, options.emaB);
    const emaDiff = emaA - emaB;
    placeTrade(emaDiff, balance, klines[0].close);
  } catch (error) {
    console.error('An error occurred during trading:', error);
  }
}

// Get current balance
async function getCurrentBalance() {
  const balance = await client.accountInfo();
  const pairBalance = balance.balances.find((b) => b.asset === options.pair.substring(3));
  return pairBalance?.free || '0';
}

// Get last candlestick
async function getLastCandlesticks() {
  const klines = await client.candles({
    symbol: options.pair,
    interval: options.candlestickInterval as CandlestickInterval,
    limit: 2,
  });
  return klines;
}

// Place buy or sell order based on EMA difference
async function placeTrade(emaDiff: number, balance: string, closePrice: string) {
  const freeBalance = parseFloat(balance);
  if (emaDiff > 0 && freeBalance > 0) {
    await sellOrder(freeBalance, closePrice);
  } else if (emaDiff < 0 && freeBalance === 0) {
    const maxQty = Math.min(freeBalance, options.maxAmount);
    await buyOrder(maxQty, closePrice);
  }
}

// Sell order
async function sellOrder(quantity: number, price: string) {
  await client.order({
    symbol: options.pair,
    side: OrderSide.SELL,
    type: OrderType.LIMIT,
    timeInForce: TimeInForce.GTC,
    quantity: quantity.toString(),
    price: price,
  });
  console.log(`Sold ${quantity} ${options.pair.substring(3)} at ${price}`);
}

// Buy order
async function buyOrder(quantity: number, price: string) {
  await client.order({
    symbol: options.pair,
    side: OrderSide.BUY,
    type: OrderType.LIMIT,
    timeInForce: TimeInForce.GTC,
    quantity: quantity.toString(),
    price: price,
  });
  console.log(`Bought ${quantity} ${options.pair.substring(3)} at ${price}`);
}

// Calculate Exponential Moving Average (EMA)
function calculateEMA(candles: any[], length: number): number {
  const prices = candles.slice(-length).map((candle) => parseFloat(candle[4]));
  const sum = prices.reduce((total, price) => total + price);
  const ema = sum / length;
  return ema;
}

// Parse command-line arguments and return options object
function parseArgs(args: string[]): ConfigOptions {
  const options: ConfigOptions = {
    apiKey: '',
    apiSecret: '',
    pair: '',
    candlestickInterval: "1m",
    emaA: 0,
    emaB: 0,
    maxAmount: 0,
  };
  for (let i = 0; i < args.length; i += 2) {
    const argName = args[i].substring(2);
    const argValue = args[i + 1];

    if (options.hasOwnProperty(argName as keyof ConfigOptions)) {
      options[argName as keyof ConfigOptions] = argValue;
    }
  }
  return options;
}

// Run the trading function
trade();
