const https = require("https");
const fs = require("fs/promises");
const path = require("path");

// Create HTTPS agent (disable cert check for dev)
const agent = new https.Agent({
  rejectUnauthorized: false, // ⚠️ Only for development!
});

let axios;
let pLimit;
let NSE_COOKIE_CACHE = { time: 0, cookie: "" };

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
  const limit = pLimit(1000); // concurrency limit

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

// Load the symbols from symbolsDb.json
async function getLargeCaps(cap = undefined) {
  try {
    if (!cap)
      throw new Error(
        'Invalid cap, please provide company size in (Crs): "cap"',
      );
    const data = await fs.readFile(symbolMetadataPath, "utf-8");
    let metadata = JSON.parse(data);
    return (
      metadata
        .filter((x) => (x.BSEID || x.NSEID) && x.exchange && x.exchange !== "-")
        // .filter((x) => !x.exchange)
        .filter((x) =>
          x.MKTCAP ? typeof x.MKTCAP === "number" && x.MKTCAP > cap : false,
        )
        .map((x) => {
          return {
            "Market Capital": x.MKTCAP,
            "Full Name": x.SC_FULLNM,
            Name: x.company,
            NSEID: x.NSEID,
            BSEID: x.BSEID,
            MKTCAP: x.MKTCAP,
            exchange: x.exchange,
            symbol: x.symbol,
          };
        })
    );
  } catch (error) {
    console.error("Error loading symbols:", error.message);
    throw error;
  }
}

// Sync call to get symbol info and store it in an array with concurrency limit
async function getSymbolMetadata(symbols) {
  const metadata = [];
  let count = 0;
  const limit = pLimit(1000); // Limit concurrency to 20 (you can adjust this number)

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

function getEMA(Price_today, EMA_yesterday, periods = undefined) {
  if (!periods || periods <= 0)
    throw new Error('Invalid "periods" for EMA calculation');
  const multiplier = 2 / (periods + 1);
  return Price_today * multiplier + EMA_yesterday * (1 - multiplier); // EMA_today
}

function normalizeCandleWidth(dataArrObject, candle_width) {
  const result = {};
  if (
    !dataArrObject.s ||
    !dataArrObject.t ||
    !dataArrObject.o ||
    !dataArrObject.c ||
    !dataArrObject.h ||
    !dataArrObject.l ||
    !dataArrObject.v
  )
    throw new Error("faulty historical data");
  else {
    ["s", "t", "o", "h", "l", "c", "v"].forEach((key) => {
      if (key === "s") result[key] = dataArrObject[key];
      else if (key === "t") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candle_width)
          result[key].push(dataArrObject[key][i]);
      } else if (key === "o") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candle_width)
          result[key].push(dataArrObject[key][i]);
      } else if (key === "c") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candle_width)
          result[key].push(dataArrObject[key][i + candle_width - 1]);
      } else if (key === "h") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candle_width)
          result[key].push(
            Math.max(...dataArrObject[key].slice(i, i + candle_width)),
          );
      } else if (key === "l") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candle_width)
          result[key].push(
            Math.min(...dataArrObject[key].slice(i, i + candle_width)),
          );
      } else if (key === "v") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candle_width)
          result[key].push(
            dataArrObject[key]
              .slice(i, i + candle_width)
              .reduce((total, num) => total + num, 0),
          );
      }
    });
    return result;
  }
}

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
    const limit = pLimit(50); // Limit concurrency to 20 (you can adjust this number)
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

async function getNSECookie() {
  try {
    if (
      NSE_COOKIE_CACHE.cookie &&
      Math.floor(Date.now() / 1000) - NSE_COOKIE_CACHE.time < 6000
    ) {
      console.log(
        "Using cached NSE cookie" +
          " cookie is " +
          (Math.floor(Date.now() / 1000) - NSE_COOKIE_CACHE.time) +
          " sec old",
      );
      return NSE_COOKIE_CACHE.cookie;
    }

    //[NSE-FETCH]
    let result = await axios.get(
      // "https://www.nseindia.com/get-quotes/derivatives?symbol=DABUR",
      "https://www.nseindia.com/get-quotes/derivatives",
      {
        httpsAgent: agent,
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.6",
          Connection: "keep-alive",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Sec-GPC": "1",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
          // "User-Agent":
          //   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
          "sec-ch-ua":
            '"Brave";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
        },
      },
    );
    NSE_COOKIE_CACHE = {
      time: Math.floor(Date.now() / 1000),
      cookie: result?.headers?.["set-cookie"].join("; "),
    };
    console.log("Fetched new NSE cookie at:", new Date().toLocaleString());
    return NSE_COOKIE_CACHE.cookie;
  } catch (error) {
    throw new Error("failed to fetch nse cookie");
  }
}

async function getDerivatives(symbol) {
  try {
    const cookie = await getNSECookie();
    //[NSE-FETCH]
    const allDerivatives = await axios.get(
      `https://www.nseindia.com/api/quote-derivative?symbol=${symbol}`,
      {
        httpsAgent: agent,
        headers: {
          Cookie: cookie,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
        },
      },
    );
    return allDerivatives?.data?.stocks;
  } catch (error) {
    throw error;
  }
}

async function getNSESymbolHistory(symbol) {
  try {
    if (!symbol || symbol === "")
      throw new Error("Invalid symbol, please provide: symbol, it is NSEID");
    const cookie = await getNSECookie();
    //[NSE-FETCH]
    const result = await axios.get(
      "https://www.nseindia.com/api/NextApi/apiClient/historicalGraph?" +
        "functionName=getIndexChart" +
        `&index=${symbol}` + // NIFTY%20SMLCAP%20100
        "&flag=15Y",
      {
        httpsAgent: agent,
        headers: {
          Cookie: cookie,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
        },
      },
    );
    return result?.data?.data;
  } catch (error) {
    if (error?.message && error.message.includes("Please provide")) throw error;
    return null;
  }
}

async function getFutureDerivatives(symbol) {
  try {
    const derivatives = await getDerivatives(symbol);
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

  await getNSECookie();

  console.log(`Checking ${stocksByCap.length} large cap stocks for futures...`);
  const limit = pLimit(20); // Limit concurrency to 20 (you can adjust this number)
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

module.exports = {
  loadModules,
  getSymbolCurrInfo,
  accAndPersistSymbols,
  syncSymbolsMetadata,
  getLargeCaps,
  getStockHistory,
  getUnderEMA,
  getAllFutureCompareToCurrent,
  getNSESymbolHistory,
};

// NSE data sample
// async function getFutureDerivatives(cap) {
//   try {
//     const symbol = "DABUR";
//     const cookie = await getNSECookie();
//     [NSE-FETCH]
//     const allDerivatives = await axios.get(
//       `https://www.nseindia.com/api/quote-derivative?symbol=${symbol}`,
//       {
//         httpsAgent: agent,
//         headers: {
//           Cookie:
//           "_abck=BD7D2167C01F6635AAE8527977CB2DF8~-1~YAAQV/EBF25dIqeZAQAAGlJdvw6kyNNj185bOy1BAyPO8pLYOs5EQ/SUYxeKvI778If8WyWZY/+2Q2D0fizjLHKXgcYS7Ri9m7yV2JHrXDMy7ivTrmYIQtf9GMfP+0gWthIEmoItre4B/KjXCi+33LkKZhV/R4SQav00OJxm+EqK9bdUjIklgUy/gCGbhwY3tyJ5+kKGkwViRIU79UcgTEqjftMeylCW/gnHTNQJC8UE0Gdjhbzzok+fcwiDWK9TDMFl0Xgsjb0yy1O2iAChvvhG+MahPnVb6omARCM49TbwZEz1l/pIzy/ZJJ2gZpkPQWbwAHEVaZtAN4ZPXikmCHUsrcu7nr1WBCDw8yjJHoDdBft8287mPNSR6WkZQGnm44ig7j+2wV5akTp1WdDvE2jfO3nHGOl0wm+RIww4HTKKbEScZ95REBqdPr7pRpZ7xdcx2V9jLz0Dag==~-1~-1~-1~-1~-1;"+
//               "ak_bmsc=9E36A83A8A302E16F061D84BD4466F9C~000000000000000000000000000000~YAAQDW/ZF0XZlH+ZAQAAC0HSvx1QgBr2v0PQ/Ii0bRhtIXD1LlwjGKJgAEK6szWTqYQod1pHlPqzIkFqmx2iBXQ3Qniyt3tjf7AC9u6vEoDbDbO9Ji2HEbInv3Q5EfTwBb4r1CvO/nICU5Y9jKwjDx3Qn8Gn80cZHxC5iYcrQ3y/xIi/kGFnCYUpeSMfDkiqKHGHzd76S5CZZxRuSnO2E3blLcgTAjKfmTqS9E10hzah4P5TfVx3w2H9KE/qv0eBK9tgjHjDvytBJZYYPsdJGXmreeJViV1WB2okLDa79XRM0cEPH7U9j8dTqxIlc1nGBa5U7vsxgbtSGPUSPfZQfZ4q+gQ/NJ8zkkzUrlslF+2Oe/N8;"+
//               "bm_mi=1F9D9CFC02DADB5BD896D92877BC323F~YAAQUEo5F1N6UKyZAQAA5ajpvx2MG6mJRipDCEMAAJtgfeaFnKWpyCDZ+Wq8D5HKhsddsBCK0fiCciCPjhrQbivoG8K9Vcvk+rY5hSMtdl8eeeodX9zo156Xt/3AHgHO5PvZGv6Kdlu94w8Wjig68HWTeR6WOxgdpGD68p8S2nsPKon+JyVG0zMG8TqOPa9pHLX8/Eq9SQc/tmXI5zfk3CI5wpivkt4u0wMzvp1Vhi9SBlGyB1eYFSILdUkOZa31rc9J0Z+Na8OHCMeog7WUQKNVlZJPnMKInJmLNnH6rTK4lsdiD/0RHzStzoPgoAY6N7z4kaVRfxC04T1aKWc5FIlbsyW5~1;"+
//               "bm_sv=9C0E6CB9A07FB1595A81CFB00B1FDA8C~YAAQUEo5F1R6UKyZAQAA5ajpvx10FdjHmIBNhozFsBhcgbXKSFCwFyxLkphKDTF7ecCgiiCIxeQZr9WcOaSNaUa36eTzRzyml7hbr5rWIc3TQJ0NnFBml8V4wG8sPZh0TJ1HKdIJm8X5Nk/3b6hZRj1quiNkesWy38gr/pnCyIaWtn6a3Npuu4rAqsM+zEmEa1fM+22F1aJ5sAa/ERGfK9tMfZJisR9Raq0D4M6h8mCPXxSk4Y6U9utZ15jXDLYYaVE=~1;"+
//               "bm_sz=B055FC791E6D4DBCCBA33B388FC49CF0~YAAQUEo5F1V6UKyZAQAA5ajpvx2aIC9hPHTJHUCZv9SI3mtOEuEP9pMInFG24conC8FyYPZfvldBNI6cPt7J30XtJ60huTrBdk2gSaanATNGXkVIWzWwtkmNnz2BCH9DmgtJ8G6/d6wpFza8hZbrRAgUVmxrXGaS8A5LjZoLcMqSot+80/7XZEiErg1CRZpCOE2a7+uy3CeuR0wnWY3hAviWVdRpBxrl1y/E57OftOaYbNL/wOAv7uxReD0E7lmmeeu4tF0diZuL2INeGKtRnz0M9aTMfkbJR7yEWpUyPmc4SoDHKpuL5DWEZCtnl/zFgXP1XcV4h6N+SGILiKRm9LzsDbu1NHPcLFfUXTHzcjSsya8icZ6V3F70uoJ0ux8fKc6+0pk50zEiO9zamziAk5qeHmdiBVBNylqLb8loDmo=~4601654~3490614;"+
//               "nseappid=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGkubnNlIiwiYXVkIjoiYXBpLm5zZSIsImlhdCI6MTc1OTg2MTM4NSwiZXhwIjoxNzU5ODY4NTg1fQ.0uo0jq9pfYAOm3x8x-9tF2Ix-xvJpPqjg4RDAL6DJrs;"+
//               "nsit=mX-4jwJrGHCnAgheyGMjwb7f",
//           'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
//
//         },
//       },
//     );
//     return allDerivatives?.data;
//   } catch (error) {
//     throw error;
//   }
// }
