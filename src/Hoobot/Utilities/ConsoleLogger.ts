import fs from "fs";
import { logToFile } from "./LogToFile";
export interface ConsoleLogger {
  push: (key: string, value: any | any[]) => ConsoleLogger;
  print: (color?: string) => void;
  writeJSONTofile: (filePath: string) => void;
  flush: () => ConsoleLogger;
}

interface consoleData {
  [key: string]: any | any[];
}

const reset = "\x1b[0m";
const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const blue = "\x1b[34m";
const magenta = "\x1b[35m";
const cyan = "\x1b[36m";

export const consoleLogger = (): ConsoleLogger => {
  let DisplayData: consoleData = {};
  const push = (key: string, value: any | any[]) => {
    if (process.env.DEBUG === "true") {
      if (typeof value === "object") {
        logToFile("./logs/debug.log", `ConsoleLogger.push(${key}, ${JSON.stringify(value, null, 2)})`);
      } else {
        logToFile("./logs/debug.log", `ConsoleLogger.push(${key}, ${value})`);
      }
    }
    if (DisplayData[key] !== undefined) {
      return logger;
    }
    const updatedData = { ...DisplayData, [key]: value };
    DisplayData = createImmutableData(updatedData);
    return logger;
  };
  const print = (color?: string) => {
    if (color === "red") {
      console.log(`${red}${JSON.stringify(DisplayData, null, 4)}${reset}`);
    } else if (color === "green") {
      console.log(`${green}${JSON.stringify(DisplayData, null, 4)}${reset}`);
    } else if (color === "yellow") {
      console.log(`${yellow}${JSON.stringify(DisplayData, null, 4)}${reset}`);
    } else if (color === "blue") {
      console.log(`${blue}${JSON.stringify(DisplayData, null, 4)}${reset}`);
    } else if (color === "magenta") {
      console.log(`${magenta}${JSON.stringify(DisplayData, null, 4)}${reset}`);
    } else if (color === "cyan") {
      console.log(`${cyan}${JSON.stringify(DisplayData, null, 4)}${reset}`);
    } else {
      console.log(JSON.stringify(DisplayData, null, 4));
    }
  };
  const writeJSONTofile = (filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        let fileBuffer = fs.readFileSync(filePath);
        if (fileBuffer.toString() === "") {
          fileBuffer = Buffer.from("[]");
        }
        const parsedJSON = JSON.parse(fileBuffer.toString());
        parsedJSON.push(DisplayData);
        fs.writeFileSync(filePath, JSON.stringify(parsedJSON, null, 4));
      } else {
        fs.writeFileSync(filePath, JSON.stringify([DisplayData], null, 4));
      }
    } catch (error) {
      console.error(error);
    }
  };
  const flush = () => {
    DisplayData = {};
    return logger;
  };
  const createImmutableData = (data: consoleData) => {
    const immutableData: consoleData = {};
    for (const key in data) {
      const value = data[key];
      if (typeof value === "object" && value !== null) {
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
    writeJSONTofile,
    flush,
  };
  return logger;
};
