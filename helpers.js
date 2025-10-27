const { addEmaToHistory } = require("./common");
const { format, getMonth } = require("date-fns");

const fs = require("fs/promises");
const path = require("path");
const {
  getNSEDerivatives,
  getNSEStockHistory,
  getNSEStockInfo,
  getNSEStockTradeInfo,
} = require("./nse");

const pLimitDefault = 100;
const { dumpObj, loadObj } = require("./logger");

const { getLargeCaps } = require("./staticData");
const {
  agent,
  getEMA,
  normalizeCandleWidth,
  calculateRSI,
  calculateWMA,
} = require("./common");

let axios;
let pLimit;

// Dynamically import axios and p-limit (ES modules)
async function loadModules() {
  axios = (await import("axios")).default;
  pLimit = (await import("p-limit")).default;
}

// Fetch symbol info from NSE or BSE
async function getSymbolCurrInfo(symbol = undefined) {
  if (!symbol || symbol === "")
    throw new Error("Invalid symbol, please provide: symbol, it is 'sc_id'");

  const exchanges = ["nse", "bse"];
  for (const exchange of exchanges) {
    try {
      //[MC-FETCH]
      const result = await axios.get(
        `https://priceapi.moneycontrol.com/pricefeed/${exchange}/equitycash/${symbol}`,
        { httpsAgent: agent },
      );
      if (result?.data?.data) return result.data.data;
      throw new Error(`failed to getSymbolCurrInfo from ${exchange}`);
    } catch (error) {
      console.warn(
        `failed to getSymbolCurrInfo from ${exchange}:`,
        error.message,
      );
    }
  }
  throw new Error(
    `Failed to fetch symbol info for '${symbol}' from both NSE and BSE.`,
  );
}

// Process each symbol combo
async function fetchSymbolSuggestion(combo) {
  try {
    //[MC-FETCH]
    const result = await axios.get(
      `https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php?classic=true&query=${combo}&type=1&format=json&callback=suggest1`,
      { httpsAgent: agent },
    );
    if (result?.data?.length) return JSON.parse(result.data.slice(9, -1));
    return null;
  } catch (error) {
    return null;
  }
}

// Generate all 3-letter lowercase combinations
function generateCombos() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789 ";
  const combos = [];

  for (let i = 0; i < chars.length; i++) {
    combos.push(chars[i]);
    for (let j = 0; j < chars.length; j++) {
      combos.push(chars[i] + chars[j]);
      for (let k = 0; k < chars.length; k++) {
        combos.push(chars[i] + chars[j] + chars[k]);
      }
    }
  }

  return combos;
}

// Main function: fetch and persist symbols
async function accAndPersistSymbols() {
  const combos = generateCombos();
  const limit = pLimit(pLimitDefault); // concurrency limit

  console.log(`🚀 Starting fetch for ${combos.length} combinations...`);

  const results = [];
  const seenSymbols = new Set();
  let count = 0;

  const tasks = combos.map((combo) =>
    limit(async () => {
      const items = await fetchSymbolSuggestion(combo);
      if (items) {
        items.forEach((item) => {
          if (item && !seenSymbols.has(item.sc_id)) {
            seenSymbols.add(item.sc_id);
            count++;
            console.log(count);
            results.push({
              name: item.name,
              sc_id: item.sc_id,
              stock_name: item.stock_name,
            });
          }
        });
      }
    }),
  );
  await Promise.all(tasks);
  const finalDict = {};
  results.forEach((item, index) => {
    finalDict[String(index + 1)] = item;
  });

  const outputPath = path.join(__dirname, "symbolsDb.json");
  await fs.writeFile(outputPath, JSON.stringify(finalDict, null, 2), "utf-8");

  console.log(`\n✅ Total unique records collected: ${results.length}`);
  console.log(`📁 Results saved to ${outputPath}`);
}

// Path to the symbols database and metadata file
const symbolsDbPath = path.join(__dirname, "symbolsDb.json");
const symbolMetadataPath = path.join(__dirname, "symbolMetadata.json");

// Load the symbols from symbolsDb.json
async function loadSymbols() {
  try {
    const data = await fs.readFile(symbolsDbPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading symbols:", error.message);
    throw error;
  }
}

// Sync call to get symbol info and store it in an array with concurrency limit
async function getSymbolMetadata(symbols) {
  const metadata = [];
  let count = 0;
  const limit = pLimit(pLimitDefault); // Limit concurrency to 20 (you can adjust this number)

  // Create tasks for each symbol and pass them to p-limit
  const tasks = Object.entries(symbols).map(([index, symbol]) =>
    limit(async () => {
      try {
        const symbolData = await getSymbolCurrInfo(symbol.sc_id); // Fetch data using sc_id
        if (symbolData) {
          count++;
          console.log(count);
          metadata.push(symbolData);
        } else {
          console.warn(`No data found for symbol: ${symbol.sc_id}`);
        }
      } catch (error) {
        console.error(
          `Failed to fetch data for symbol ${symbol.sc_id}:`,
          error.message,
        );
      }

      // Log progress every 100 symbols (use index directly)
      if (parseInt(index) % 100 === 0) {
        console.log(
          `Processed ${parseInt(index) + 1} of ${Object.keys(symbols).length}`,
        );
      }
    }),
  );

  // Wait for all tasks to complete
  await Promise.all(tasks);

  return metadata;
}

// Save metadata to symbolMetadata.json
async function saveMetadata(metadata) {
  try {
    await fs.writeFile(
      symbolMetadataPath,
      JSON.stringify(metadata, null, 2),
      "utf-8",
    );
    console.log(`Metadata saved to ${symbolMetadataPath}`);
  } catch (error) {
    console.error("Error saving metadata:", error.message);
  }
}

// Main sync function to load, fetch and save metadata
async function syncSymbolsMetadata() {
  try {
    console.log("Loading symbols from symbolsDb.json...");
    const symbols = await loadSymbols();
    console.log(
      `Found ${Object.keys(symbols).length} symbols. Fetching metadata...`,
    );

    const metadata = await getSymbolMetadata(symbols);

    console.log(`Fetched metadata for ${metadata.length} symbols. Saving...`);
    await saveMetadata(metadata);

    console.log(`✅ Sync completed! Metadata saved.`);
  } catch (error) {
    console.error("Error during sync:", error.message);
  }
}

// get history data for a symbol
async function getStockHistory(
  symbol = undefined,
  candle_width = undefined,
  candle_unit = undefined,
  ema = undefined,
  from = 0,
  to = Math.floor(Date.now() / 1000),
  countback = undefined,
  currencyCode = "INR",
) {
  try {
    if (
      !symbol ||
      symbol === "" ||
      !candle_width ||
      !candle_unit ||
      !["H", "D"].includes(candle_unit) ||
      !ema
    )
      throw new Error(
        "Please provide:" +
          " (symbol: should be NSEID)" +
          " (candle_width: should be integer)" +
          " (candle_unit: should be 'H' for hours or 'D' for days)" +
          " (ema: should be an integer)",
      );

    candle_width = parseInt(candle_width);
    ema = parseInt(ema);
    //[MC-FETCH]
    const result = await axios.get(
      `https://priceapi.moneycontrol.com/techCharts/indianMarket/stock/history?` +
        `symbol=${symbol}` +
        `&resolution=${candle_unit === "H" ? 60 : "1D"}` +
        `&from=${from}` +
        `&to=${to}` +
        `&countback=${countback ?? candle_width * 40 - 1}` +
        `&currencyCode=${currencyCode}`,
      { httpsAgent: agent },
    );

    if (result?.data) {
      const normalizedData = normalizeCandleWidth(result?.data, candle_width);
      // calculate EMA
      if (normalizedData.c.length >= ema) {
        let emaValues = new Array(ema).fill(0);
        // Start by calculating the simple moving average (SMA) for the first 5 periods

        emaValues[ema - 1] =
          normalizedData.c
            .slice(0, ema)
            .reduce((sum, price) => sum + price, 0) / ema; // EMA for the 5th data point is the SMA
        // Now calculate the EMA for the rest of the data points
        for (let i = 5; i < normalizedData.c.length; i++) {
          emaValues[i] = getEMA(normalizedData.c[i], emaValues[i - 1], ema);
        }
        normalizedData.ema = emaValues;
      }
      return normalizedData;
    }
    return null;
  } catch (error) {
    if (error?.message && error.message.includes("Please provide")) throw error;
    return null;
  }
}

// function getEMA(priceCurr, EMALast, periods = undefined) {
//   if (!periods || periods <= 0)
//     throw new Error('Invalid "periods" for EMA calculation');
//   const multiplier = 2 / (periods + 1);
//   return priceCurr * multiplier + EMALast * (1 - multiplier); // EMA_today
// }

// function normalizeCandleWidth(dataArrObject, candle_width) {
//   const result = {};
//   if (
//     !dataArrObject.s ||
//     !dataArrObject.t ||
//     !dataArrObject.o ||
//     !dataArrObject.c ||
//     !dataArrObject.h ||
//     !dataArrObject.l ||
//     !dataArrObject.v
//   )
//     throw new Error("faulty historical data");
//   else {
//     ["s", "t", "o", "h", "l", "c", "v"].forEach((key) => {
//       if (key === "s") result[key] = dataArrObject[key];
//       else if (key === "t") {
//         // timestamp
//         result[key] = [];
//         for (let i = 0; i < dataArrObject[key].length; i += candle_width)
//           result[key].push(dataArrObject[key][i]);
//       } else if (key === "o") {
//         // timestamp
//         result[key] = [];
//         for (let i = 0; i < dataArrObject[key].length; i += candle_width)
//           result[key].push(dataArrObject[key][i]);
//       } else if (key === "c") {
//         // timestamp
//         result[key] = [];
//         for (let i = 0; i < dataArrObject[key].length; i += candle_width)
//           result[key].push(dataArrObject[key][i + candle_width - 1]);
//       } else if (key === "h") {
//         // timestamp
//         result[key] = [];
//         for (let i = 0; i < dataArrObject[key].length; i += candle_width)
//           result[key].push(
//             Math.max(...dataArrObject[key].slice(i, i + candle_width)),
//           );
//       } else if (key === "l") {
//         // timestamp
//         result[key] = [];
//         for (let i = 0; i < dataArrObject[key].length; i += candle_width)
//           result[key].push(
//             Math.min(...dataArrObject[key].slice(i, i + candle_width)),
//           );
//       } else if (key === "v") {
//         // timestamp
//         result[key] = [];
//         for (let i = 0; i < dataArrObject[key].length; i += candle_width)
//           result[key].push(
//             dataArrObject[key]
//               .slice(i, i + candle_width)
//               .reduce((total, num) => total + num, 0),
//           );
//       }
//     });
//     return result;
//   }
// }
//
function getUnderEMA(
  candle_width = undefined,
  candle_unit = undefined,
  ema = undefined,
  cap = undefined,
) {
  if (
    !candle_width ||
    !candle_unit ||
    !["H", "D"].includes(candle_unit) ||
    !ema ||
    !cap
  )
    throw new Error(
      "Please provide:" +
        " (candle_width: should be integer)" +
        " (candle_unit: should be 'H' for hours or 'D' for days)" +
        " (ema: should be an integer)" +
        " (cap: should be company size in [Crs])",
    );
  return getLargeCaps(cap).then((largeCaps) => {
    console.log(`Checking ${largeCaps.length} large cap stocks...`);
    const limit = pLimit(pLimitDefault); // Limit concurrency to 20 (you can adjust this number)
    const tasks = largeCaps.map((stock) =>
      limit(async () => {
        try {
          const history = await getStockHistory(
            stock.NSEID || stock.BSEID,
            candle_width,
            candle_unit,
            ema,
          );
          if (
            history &&
            history.ema &&
            history.c &&
            history.ema.length > 0 &&
            history.c.length > 0
          ) {
            const latestHigh = history.h[history.c.length - 1];
            const latestEMA = history.ema[history.ema.length - 1];
            const time = history.t[history.t.length - 1];
            if (latestHigh < latestEMA) {
              console.log(
                `Stock ${stock.Name} (${
                  stock.NSEID || stock.BSEID
                }) is under its ${ema}-period EMA.`,
              );
              return {
                time: new Date(time * 1000).toLocaleString(),
                latestHigh,
                latestEMA,
                ...stock,
              };
            }
          }
        } catch (error) {
          console.error(
            `Error fetching history for ${stock.Name} (${
              stock.NSEID || stock.BSEID
            }):`,
            error.message,
          );
        }
        return null;
      }),
    );

    return Promise.all(tasks).then((results) =>
      results.filter((result) => result !== null),
    );
  });
}

async function getFutureDerivatives(symbol) {
  try {
    const derivatives = await getNSEDerivatives(symbol);
    return derivatives
      .filter((x) => x.metadata.instrumentType === "Stock Futures")
      .map((x) => ({
        // symbol,
        "Future ClosePrice": x.metadata.closePrice,
        "Future LastPrice": x.metadata.lastPrice,
        expiryDate: x.metadata.expiryDate,
      }));
  } catch (error) {
    throw error;
  }
}

async function getAllFutureCompareToCurrent(cap, comparator = "less") {
  let stocksByCap = await getLargeCaps(cap);

  console.log(`Checking ${stocksByCap.length} large cap stocks for futures...`);
  const limit = pLimit(pLimitDefault); // Limit concurrency to 20 (you can adjust this number)
  const tasks = stocksByCap.map((stock) =>
    limit(async () => {
      try {
        const futures = await getFutureDerivatives(stock.NSEID || stock.BSEID);
        if (futures && futures.length > 0) {
          const currentInfo = await getSymbolCurrInfo(
            stock.symbol, // it is sc_id from money control
          );
          if (currentInfo && currentInfo.pricecurrent) {
            const underFutures = futures.filter((x) => {
              const futurePrice =
                x["Future ClosePrice"] === 0
                  ? x["Future LastPrice"]
                  : x["Future ClosePrice"];
              return (
                (comparator === "less"
                  ? futurePrice <= currentInfo.pricecurrent
                  : futurePrice >= currentInfo.pricecurrent) &&
                x["Future LastPrice"] !== 0
              );
            });
            if (underFutures.length > 0) {
              console.log(
                `Stock ${stock.Name} (${stock.NSEID || stock.BSEID}) has ${underFutures.length} futures under current price.`,
              );
              return underFutures.map((x) => ({
                "Company Name": stock["Full Name"],
                "Spot Price": currentInfo.pricecurrent,
                ...x,
                "change percent%": `${parseFloat(((x["Future ClosePrice"] === 0 ? x["Future LastPrice"] : x["Future ClosePrice"]) - currentInfo.pricecurrent) * (100 / currentInfo.pricecurrent)).toFixed(3)}`,
                "Mkt Cap:": currentInfo.MKTCAP,
              }));
            }
          }
        } else {
          console.log("no future for: ", stock.Name);
          return [];
        }
      } catch (error) {
        console.error(
          `Error fetching futures for ${stock.Name} (${
            stock.NSEID || stock.BSEID
          }):`,
          error.message,
        );
      }
      return [];
    }),
  );

  const results = await Promise.all(tasks);
  return results.flat();
}

async function getEma20_50_100_under_200(
  cap,
  candle_width_in_days = 5,
  from_ema_200_plus_x_percent = 0,
) {
  if (!candle_width_in_days || typeof candle_width_in_days !== "number")
    throw new Error("Candle Width in Days, should be a number");
  if (
    (!from_ema_200_plus_x_percent && from_ema_200_plus_x_percent !== 0) ||
    typeof from_ema_200_plus_x_percent !== "number"
  )
    throw new Error("x % above EMA 200 should be a number, like: 2 or -2");
  let stocksByCap = await getLargeCaps(cap);
  // let ema20_50_100_under_200 = [];
  console.log(
    `Checking ${stocksByCap.length} large cap stocks for EMA conditions...`,
  );
  const limit = pLimit(pLimitDefault); // Limit concurrency to 20 (you can adjust this number)
  const tasks = stocksByCap.map((stock) =>
    limit(async () => {
      try {
        if (stock.NSEID === "LICI") console.log("here");
        let history = await getNSEStockHistory(
          stock.NSEID || stock.BSEID,
          "EQ",
        );
        history = normalizeCandleWidth(history, candle_width_in_days);
        history = addEmaToHistory(history, 200);
        history = addEmaToHistory(history, 100);
        history = addEmaToHistory(history, 50);
        history = addEmaToHistory(history, 20);
        const n = history.c.length - 1; // last
        if (!history[`ema20`]) throw new Error("no ema20 for " + stock.NSEID);
        if (!history[`ema50`]) throw new Error("no ema50 for " + stock.NSEID);
        if (!history[`ema100`]) throw new Error("no ema100 for " + stock.NSEID);
        if (!history[`ema200`]) throw new Error("no ema200 for " + stock.NSEID);
        if (
          history[`ema20`][n] <=
            history[`ema200`][n] * (1 + 0.01 * from_ema_200_plus_x_percent) &&
          history[`ema50`][n] <=
            history[`ema200`][n] * (1 + 0.01 * from_ema_200_plus_x_percent) &&
          history[`ema100`][n] <=
            history[`ema200`][n] * (1 + 0.01 * from_ema_200_plus_x_percent)
        ) {
          console.log(
            `Stock ${stock.Name} (${stock.NSEID || stock.BSEID}) meets EMA conditions.`,
          );
          return {
            time: format(new Date(history.t[n] * 1000), "dd-MMM-yyyy"),
            ema20: history[`ema20`][n].toFixed(3),
            ema50: history[`ema50`][n].toFixed(3),
            ema100: history[`ema100`][n].toFixed(3),
            ema200: history[`ema200`][n].toFixed(3),
            ...stock,
          };
        }
      } catch (error) {
        console.error(
          `Error fetching history for ${stock.Name} (${
            stock.NSEID || stock.BSEID
          }):`,
          error.message,
        );
      }
      return null;
    }),
  );

  const results = await Promise.all(tasks);
  return results.filter((result) => result !== null);
}

async function rsiCompTo(
  cap,
  candle_width_in_days = 5,
  rsi = undefined,
  compare_value = 0,
  operator = "above", // below
) {
  if (!candle_width_in_days || typeof candle_width_in_days !== "number")
    throw new Error("Candle Width in Days, should be a number");
  if (
    (!compare_value && compare_value !== 0) ||
    typeof compare_value !== "number"
  )
    throw new Error("Compare Value should be a number, like: 80 or 20 etc");
  if (!["above", "below"].includes(operator))
    throw new Error("Operator should be 'above' or 'below'");
  let stocksByCap = await getLargeCaps(cap);
  // let ema20_50_100_under_200 = [];
  console.log(
    `Checking ${stocksByCap.length} large cap stocks for EMA conditions...`,
  );
  const limit = pLimit(pLimitDefault); // Limit concurrency to 20 (you can adjust this number)
  const tasks = stocksByCap.map((stock) =>
    limit(async () => {
      try {
        let history = await getNSEStockHistory(
          stock.NSEID || stock.BSEID,
          "EQ",
        );
        // [pretty time]
        // history.t = history.t.map(x=>
        //   format(new Date(x * 1000), "dd-MMM-yyyy")
        // );
        history = normalizeCandleWidth(history, candle_width_in_days);
        history[`rsi${rsi}`] = calculateRSI(history.c, rsi);
        // history[`wma21` ] = calculateWMA(history.c, 21); // calculateWMA is wrong implementation
        if (!history[`rsi${rsi}`])
          throw new Error(`no rsi${rsi} for ` + stock.NSEID);
        // if (!history[`wma21`]) throw new Error(`no wma21 for ` + stock.NSEID);
        const n = history.c.length - 1; // last
        if (operator === "above" && history[`rsi${rsi}`][n] >= compare_value)
          return {
            time: format(new Date(history.t[n] * 1000), "dd-MMM-yyyy"),
            [`rsi${rsi}`]: history[`rsi${rsi}`][n],
            compare_value: compare_value,
            ...stock,
          };
        else if (
          operator === "below" &&
          history[`rsi${rsi}`][n] <= compare_value
        )
          return {
            time: format(new Date(history.t[n] * 1000), "dd-MMM-yyyy"),
            [`rsi${rsi}`]: history[`rsi${rsi}`][n],
            ...stock,
          };
      } catch (error) {
        console.error(
          `Error fetching history for ${stock.Name} (${
            stock.NSEID || stock.BSEID
          }):`,
          error.message,
        );
      }
      return null;
    }),
  );

  const results = await Promise.all(tasks);
  return results.filter((result) => result !== null);
}

async function findDoji(
  cap,
  candle_width_in_days = 1,
  doji_length_percentage = undefined,
) {
  if (!candle_width_in_days || typeof candle_width_in_days !== "number")
    throw new Error("Candle Width in Days, should be a number");
  if (
    (!doji_length_percentage && doji_length_percentage !== 0) ||
    typeof doji_length_percentage !== "number"
  )
    throw new Error(
      "Doji Length Percentage should be a number, like: 10 or 20 etc",
    );
  let stocksByCap = await getLargeCaps(cap);
  // let ema20_50_100_under_200 = [];
  console.log(
    `Checking ${stocksByCap.length} large cap stocks for EMA conditions...`,
  );
  const limit = pLimit(pLimitDefault); // Limit concurrency to 20 (you can adjust this number)
  const tasks = stocksByCap.map((stock) =>
    limit(async () => {
      try {
        let history = await getNSEStockHistory(
          stock.NSEID || stock.BSEID,
          "EQ",
          Math.floor(Date.now() / 1000) - 24 * 3600 * 10, // in past 10 days
        );
        // [pretty time]
        // history.t = history.t.map(x=>
        //   format(new Date(x * 1000), "dd-MMM-yyyy")
        // );
        history = normalizeCandleWidth(history, candle_width_in_days);
        const historyDataLength = history.t.length;
        const lastCandleVirtualLength =
          history.h[historyDataLength - 1] - history.l[historyDataLength - 1];
        const lastCandleSolidLength = Math.abs(
          history.o[historyDataLength - 1] - history.c[historyDataLength - 1],
        );
        if (
          (lastCandleSolidLength * 100) / lastCandleVirtualLength <=
          doji_length_percentage
        ) {
          return {
            Time: format(
              new Date(history.t[historyDataLength - 1] * 1000),
              "dd-MMM-yyyy",
            ),
            Name: stock["Full Name"],
            "Doji Length %": (
              (lastCandleSolidLength * 100) /
              lastCandleVirtualLength
            ).toFixed(2),
            "Doji % above base": (
              (Math.abs(
                Math.min(
                  history.c[historyDataLength - 1],
                  history.o[historyDataLength - 1],
                ) - history.l[historyDataLength - 1],
              ) *
                100) /
              lastCandleVirtualLength
            ).toFixed(2),
            "Market Capital": stock["Market Capital"],
            NSEID: stock.NSEID,
          };
        }

        // history[`rsi${rsi}`] = calculateRSI(history.c, rsi);
        // // history[`wma21` ] = calculateWMA(history.c, 21); // calculateWMA is wrong implementation
        // if (!history[`rsi${rsi}`])
        //   throw new Error(`no rsi${rsi} for ` + stock.NSEID);
        // // if (!history[`wma21`]) throw new Error(`no wma21 for ` + stock.NSEID);
        // const n = history.c.length - 1; // last
        // if (operator === "above" && history[`rsi${rsi}`][n] >= compare_value)
        //   return {
        //     time: format(new Date(history.t[n] * 1000), "dd-MMM-yyyy"),
        //     [`rsi${rsi}`]: history[`rsi${rsi}`][n],
        //     compare_value: compare_value,
        //     ...stock,
        //   };
        // else if (
        //   operator === "below" &&
        //   history[`rsi${rsi}`][n] <= compare_value
        // )
        //   return {
        //     time: format(new Date(history.t[n] * 1000), "dd-MMM-yyyy"),
        //     [`rsi${rsi}`]: history[`rsi${rsi}`][n],
        //     ...stock,
        //   };
      } catch (error) {
        console.error(
          `Error fetching history for ${stock.Name} (${
            stock.NSEID || stock.BSEID
          }):`,
          error.message,
        );
      }
      return null;
    }),
  );

  const results = await Promise.all(tasks);
  return results.filter((result) => result !== null);
}

async function getGapUpAndGapDown(cap, threshold_percent = 3) {
  if (!threshold_percent || typeof threshold_percent !== "number")
    throw new Error("Threshold %, should be a number");
  let stocksByCap = await getLargeCaps(cap);
  // let ema20_50_100_under_200 = [];
  console.log(
    `Checking ${stocksByCap.length} large cap stocks for EMA conditions...`,
  );
  const limit = pLimit(pLimitDefault); // Limit concurrency to 20 (you can adjust this number)
  const tasks = stocksByCap.map((stock) =>
    limit(async () => {
      try {
        let stockInfo = await getNSEStockInfo(stock.NSEID);
        // let stockTradeInfo = await getNSEStockTradeInfo(stock.NSEID);
        let { priceInfo } = stockInfo;
        const { previousClose, open, lastPrice } = priceInfo;
        if (
          Math.abs((open - previousClose) * (100 / previousClose)) >=
          threshold_percent
        )
          return {
            "Company Name": stockInfo.info.companyName,
            ["Previous Close"]: previousClose,
            Open: open,
            ["open change percent%"]: (
              (open - previousClose) *
              (100 / previousClose)
            ).toFixed(2),
            lastPrice,
            ["net change percent%"]: (
              (lastPrice - previousClose) *
              (100 / previousClose)
            ).toFixed(2),
            ["Market Capital"]: stock["Market Capital"],
          };
      } catch (error) {
        console.error(
          `Error fetching history for ${stock.Name} (${
            stock.NSEID || stock.BSEID
          }):`,
          error.message,
        );
      }
      return null;
    }),
  );

  const results = await Promise.all(tasks);
  return results.filter((result) => result !== null);
}

async function backTrack(cap = 300000, investmentPerTransaction = 100000) {
  let stocksByCap = await getLargeCaps(cap);
  // let ema20_50_100_under_200 = [];
  console.log(
    `Checking ${stocksByCap.length} large cap stocks for EMA conditions...`,
  );
  const limit = pLimit(pLimitDefault); // Limit concurrency to 20 (you can adjust this number)
  const tasks = stocksByCap.map((stock) =>
    limit(async () => {
      try {
        let history = await getNSEStockHistory(
          stock.NSEID || stock.BSEID,
          "EQ",
        );
        return {
          name: stock.Name,
          history,
        };
      } catch (error) {
        console.error(
          `Error fetching history for ${stock.Name} (${
            stock.NSEID || stock.BSEID
          }):`,
          error.message,
        );
      }
      return null;
    }),
  );

  // let results = await Promise.all(tasks);
  // dumpObj(results, "backtrack_stocks_history")
  let results = loadObj("backtrack_stocks_history");
  let sliceValue = 6000;
  results.forEach((x) => {
    delete x.history.s;
    Object.keys(x.history).forEach((key) => {
      x.history[key] = x.history[key].slice(-1 * sliceValue); // last 250 days
    });
    x.history.t = x.history.t.map((x) =>
      format(new Date(x * 1000), "dd-MMM-yyyy"),
    );
  });
  results = results.filter((result) => result.history.t.length === sliceValue);
  const monthStarts = [];
  const monthEnds = [];
  for (let i = 1; i < results[0].history.t.length; i++) {
    const month = getMonth(new Date(results[0].history.t[i]));
    const prev_date_month = getMonth(new Date(results[0].history.t[i - 1]));
    if (month !== prev_date_month) {
      if (monthStarts.length > 0) monthEnds.push(i - 1);
      monthStarts.push(i);
    }
  }
  let net_inv = 0;
  let net_profit = 0;
  results.forEach((stock) => {
    // i will buy is profit is on closeing price of monthStarts[i], if there is profit in open and close price by 1 %
    // and if i bought, i will sell on monthEnds[i]

    for (let i = 0; i < monthStarts.length - 1; i++) {
      const buy_price = stock.history.c[monthStarts[i] + 1];
      const sell_price = stock.history.c[monthEnds[i]];
      if (
        (stock.history.c[monthStarts[i]] - stock.history.o[monthStarts[i]]) *
          (100 / stock.history.o[monthStarts[i]]) >=
          1 &&
        (stock.history.c[monthStarts[i + 1]] -
          stock.history.o[monthStarts[i + 1]]) *
          (100 / stock.history.o[monthStarts[i + 1]]) >=
          1
      ) {
        // if 2 consecutive day +1 percent change
        // I will buy
        const qty = Math.floor(investmentPerTransaction / buy_price);
        net_inv += qty * buy_price;
        net_profit += qty * (sell_price - buy_price);
      }
    }
  });
  return [
    {
      net_profit,
      net_inv,
      ["profit%"]: ((net_profit * 100) / net_inv).toFixed(2),
    },
  ];
}

module.exports = {
  loadModules,
  getSymbolCurrInfo,
  accAndPersistSymbols,
  syncSymbolsMetadata,
  getLargeCaps,
  getStockHistory,
  getUnderEMA,
  getAllFutureCompareToCurrent,
  getEma20_50_100_under_200,
  rsiCompTo,
  getGapUpAndGapDown,
  findDoji,
  backTrack,
};
