const axios = require("axios");
const { agent, normalizeCandleWidth, getEMA } = require("./common");
let NSE_COOKIE_CACHE = { time: 0, cookie: "" };

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

async function getNSEDerivatives(symbol) {
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

/*
get nse history for the symbol, and type
 */
async function getNSEStockHistory(symbol = undefined, type = "EQ") {
  try {
    if (!symbol) throw new Error("Please provide a valid symbol");
    if (!["EQ"].includes(type))
      throw new Error("Please provide a valid type from [EQ]");

    // Construct the trading symbol
    const tradingSymbol = `${symbol}-${type}`;

    // Time range (e.g., from 0 to now in seconds)
    const fromDate = 0;
    const toDate = Math.floor(Date.now() / 1000); // current timestamp in seconds

    // Request payload
    const staticKeys = {
      exch: "N",
      fromDate,
      toDate,
      timeInterval: 1,
      chartPeriod: "D",
      chartStart: 0,
    };
    const payload = {
      tradingSymbol,
      ...staticKeys,
    };

    // chartPeriod can be "I" (intraday), "D" (daily), "W" (weekly), "M" (monthly)
    const cookie = await getNSECookie();
    const response = await axios.post(
      "https://charting.nseindia.com/Charts/ChartData",
      payload,
      {
        httpsAgent: agent,
        headers: {
          Cookie: cookie,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
        },
      },
    );
    // // make it pretty
    // response.data.t = response.data.t.map((timestamp) =>
    //   new Date(timestamp * 1000).toISOString(),
    // );
    return response.data;
  } catch (error) {
    if (error?.message && error.message.includes("Please provide")) {
      throw error;
    }
    console.error("Error fetching NSE stock history:", error.message);
    return null;
  }
}

/*
get nse history for the symbol, and type
 */
async function getNSEStockInfo(symbol = undefined) {
  try {
    if (!symbol) throw new Error("Please provide a valid symbol");
    // chartPeriod can be "I" (intraday), "D" (daily), "W" (weekly), "M" (monthly)
    const cookie = await getNSECookie();
    const response = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${symbol}`,
      {
        httpsAgent: agent,
        headers: {
          Cookie: cookie,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
        },
      },
    );
    return response.data;
  } catch (error) {
    if (error?.message && error.message.includes("Please provide")) {
      throw error;
    }
    console.error("Error fetching NSE stock history:", error.message);
    return null;
  }
}

module.exports = {
  getNSECookie,
  getNSEDerivatives,
  getNSEStockHistory,
  getNSEStockInfo,
};
