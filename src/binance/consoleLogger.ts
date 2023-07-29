/* =====================================================================
* Binance Trading Bot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited.
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