export interface ConsoleLogger {
  push: (key: string, value: string | string[] | number | boolean | object | undefined) => ConsoleLogger;
  print: () => void;
  flush: () => ConsoleLogger;
}

interface consoleData {
  [key: string]: string | string[] | number | boolean | object | undefined;
}

const consoleLogger = (): ConsoleLogger => {
  let DisplayData: consoleData = {};

  const push = (key: string, value: string | string[] | number | boolean | object | undefined) => {
    const updatedData = { ...DisplayData, [key]: value };
    DisplayData = createImmutableData(updatedData);
    return logger;
  };

  const print = () => {
    console.log(JSON.stringify(DisplayData, null, 4));
  };

  const flush = () => {
    DisplayData = {};
    return logger;
  };

  const createImmutableData = (data: consoleData) => {
    const immutableData: consoleData = {};
    for (const key in data) {
      const value = data[key];
      if (typeof value === 'object' && value !== null) {
        immutableData[key] = createImmutableData(value as consoleData);
      } else {
        immutableData[key] = value;
      }
    }
    return Object.freeze(immutableData);
  };

  const logger: ConsoleLogger = {
    push,
    print,
    flush,
  };

  return logger;
};

export default consoleLogger();