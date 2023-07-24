import fs from 'fs';

const logFilePath = './trading_logs.txt';

// Log to file function
export function logToFile(logMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.appendFile(logFilePath, `${logMessage}\n`, (err) => {
      if (err) {
        console.error('Error writing to log file:', err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}