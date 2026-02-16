import fs from "fs";

// Log to file function
export const logToFile = async (logFilePath: string, logMessage: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, "");
    }
    fs.appendFile(logFilePath, `${logMessage}\n`, (err) => {
      if (err) {
        console.error("Error writing to log file:", err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};
