const https = require("https");
const fs = require("fs/promises");
const path = require("path");

// Create HTTPS agent (disable cert check for dev)
const agent = new https.Agent({
  rejectUnauthorized: false, // ⚠️ Only for development!
});

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
            exchange: x.exchange,
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
  currencyCode = "INR",
) {
  try {
    if (!symbol || symbol === "" || !candle_width || !candle_unit || !ema)
      throw new Error(
        "Please provide:" +
          " (symbol: should be NSEID)" +
          " (candle_width: should be integer)" +
          " (candle_unit: should be 'H' for hours or 'D' for days)" +
          " (ema: should be an integer)",
      );

    candle_width = parseInt(candle_width);
    ema = parseInt(ema);
    const result = await axios.get(
      `https://priceapi.moneycontrol.com/techCharts/indianMarket/stock/history?` +
        `symbol=${symbol}` +
        `&resolution=${candle_unit === "H" ? 60 : "1D"}` +
        `&from=${from}` +
        `&to=${to}` +
        `&countback=${candle_width * 40 - 1}` +
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
    if (error?.message && error.message.includes("Please provide"))
      throw error;
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
  if (!candle_width || !candle_unit || !ema || !cap)
    throw new Error(
      "Invalid parameters, please provide: candle_width, candle_unit, ema, cap" +
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

module.exports = {
  loadModules,
  getSymbolCurrInfo,
  accAndPersistSymbols,
  syncSymbolsMetadata,
  getLargeCaps,
  getStockHistory,
  getUnderEMA,
};
