const { Client, CandlestickInterval, OrderSide, OrderType, TimeInForce } = require('binance-api-node');
const { getCurrentBalance, getLastCandlesticks, placeTrade, sellOrder, buyOrder, calculateEMA } = require('./tradingBot');

// Mock Binance client
jest.mock('binance-api-node');
const mockClient = {
  accountInfo: jest.fn(),
  candles: jest.fn(),
  order: jest.fn(),
};
Client.mockImplementation(() => mockClient);

// Mock console.log
console.log = jest.fn();

// Mock configuration options
const options = {
  apiKey: 'test-api-key',
  apiSecret: 'test-api-secret',
  pair: 'BTCUSDT',
  candlestickInterval: CandlestickInterval.ONE_MINUTE,
  emaA: 7,
  emaB: 25,
  maxAmount: 0.1,
};

describe('Trading Bot', () => {
  describe('getCurrentBalance', () => {
    it('should return the free balance of the specified pair', async () => {
      const mockBalance = { balances: [{ asset: 'USDT', free: '100' }] };
      mockClient.accountInfo.mockResolvedValue(mockBalance);

      const balance = await getCurrentBalance(options);

      expect(mockClient.accountInfo).toHaveBeenCalled();
      expect(balance).toBe('100');
    });
  });

  describe('getLastCandlesticks', () => {
    it('should return the last two candlesticks', async () => {
      const mockCandles = [{ close: '100' }, { close: '150' }];
      mockClient.candles.mockResolvedValue(mockCandles);

      const klines = await getLastCandlesticks(options);

      expect(mockClient.candles).toHaveBeenCalled();
      expect(klines).toEqual(mockCandles);
    });
  });

  describe('placeTrade', () => {
    it('should place a sell order when emaDiff is positive and balance is greater than 0', async () => {
      const balance = '10';
      const emaDiff = 1;
      const closePrice = '200';

      await placeTrade(emaDiff, balance, closePrice, options);

      expect(mockClient.order).toHaveBeenCalledWith({
        symbol: options.pair,
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        timeInForce: TimeInForce.GTC,
        quantity: parseFloat(balance),
        price: closePrice,
      });
      expect(console.log).toHaveBeenCalledWith(`Sold ${balance} ${options.pair.substring(3)} at ${closePrice}`);
    });

    it('should place a buy order when emaDiff is negative and balance is 0', async () => {
      const balance = '0';
      const emaDiff = -1;
      const closePrice = '150';

      await placeTrade(emaDiff, balance, closePrice, options);

      expect(mockClient.order).toHaveBeenCalledWith({
        symbol: options.pair,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        timeInForce: TimeInForce.GTC,
        quantity: options.maxAmount,
        price: closePrice,
      });
      expect(console.log).toHaveBeenCalledWith(`Bought ${options.maxAmount} ${options.pair.substring(3)} at ${closePrice}`);
    });

    it('should not place any order when emaDiff is 0', async () => {
      const balance = '10';
      const emaDiff = 0;
      const closePrice = '100';

      await placeTrade(emaDiff, balance, closePrice, options);

      expect(mockClient.order).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('sellOrder', () => {
    it('should place a sell order with the specified quantity and price', async () => {
      const quantity = 5;
      const price = '200';

      await sellOrder(quantity, price);

      expect(mockClient.order).toHaveBeenCalledWith({
        symbol: options.pair,
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        timeInForce: TimeInForce.GTC,
        quantity: quantity,
        price: price,
      });
      expect(console.log).toHaveBeenCalledWith(`Sold ${quantity} ${options.pair.substring(3)} at ${price}`);
    });
  });

  describe('buyOrder', () => {
    it('should place a buy order with the specified quantity and price', async () => {
      const quantity = 0.05;
      const price = '150';

      await buyOrder(quantity, price);

      expect(mockClient.order).toHaveBeenCalledWith({
        symbol: options.pair,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        timeInForce: TimeInForce.GTC,
        quantity: quantity,
        price: price,
      });
      expect(console.log).toHaveBeenCalledWith(`Bought ${quantity} ${options.pair.substring(3)} at ${price}`);
    });
  });

  describe('calculateEMA', () => {
    it('should calculate the Exponential Moving Average', () => {
      const candles = [
        { close: '100' },
        { close: '150' },
        { close: '200' },
        { close: '250' },
        { close: '300' },
      ];
      const length = 5;
      const expectedEMA = (100 + 150 + 200 + 250 + 300) / 5;

      const ema = calculateEMA(candles, length);

      expect(ema).toBe(expectedEMA);
    });
  });
});
