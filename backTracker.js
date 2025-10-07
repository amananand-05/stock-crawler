const {
  loadModules,
  getSymbolCurrInfo,
  accAndPersistSymbols,
  syncSymbolsMetadata,
  getLargeCaps,
  getStockHistory,
  getUnderEMA,
} = require("./helpers");

async function backTrackStock(
  strategy,
  symbol, // NSEID
  investmentPerPurchase,
) {
  if (!strategy || !symbol || !investmentPerPurchase)
    throw new Error(
      "Please provide:" +
        " (strategy: like - '3H-1H-EMA')" +
        " (symbol: NSEID, like - TITAN)" +
        " (investmentPerPurchase: how much you will spend in per purchase, like - 10000)",
    );
  let result = {};
  switch (strategy) {
    case "3H-1H-EMA":
      result = await backTrackStock3H1HEMA(
        strategy,
        symbol, // NSEID
        investmentPerPurchase,
      );
      break;
    default:
      throw new Error("Please valid provide: like - '3H-1H-EMA'");
      break;
  }
  return result;
}

async function backTrackStock3H1HEMA(
  strategy,
  symbol, // NSEID
  investmentPerPurchase,
) {
  // this function will backtrack 3H-1H-EMA strategy for the given symbol

  console.log("here");
  try {
    const ema_3h_candle = await getStockHistory(
      symbol,
      3,
      "H",
      5,
      undefined,
      undefined,
      401,
    );
    const ema_1h_candle = await getStockHistory(
      symbol,
      1,
      "H",
      5,
      undefined,
      undefined,
      401,
    );
    let spend = 0;
    let profit = 0;

    const prettyDate = (time) => new Date(time * 1000).toLocaleString();
    const entryPoints = {};
    for (let i = 10; i < ema_3h_candle.t.length; i++) {
      if (
        ema_3h_candle.h[i - 1] < ema_3h_candle.ema[i - 1] &&
        ema_3h_candle.h[i - 1] < ema_3h_candle.c[i]
      ) {
        // const timeAt =
        const timeAt = ema_3h_candle.t[i];
        entryPoints[timeAt] = {
          // assuming, I will be able to buy at the closing price, in the next candle opening
          buyPrice: ema_3h_candle.c[i],
          timeAt: timeAt,
          prettyTimeAt: prettyDate(timeAt),
          units: parseInt(investmentPerPurchase / ema_3h_candle.c[i]),
          sum:
            parseInt(investmentPerPurchase / ema_3h_candle.c[i]) *
            ema_3h_candle.c[i],
          stopLoss: ema_3h_candle.l[i - 1],
        };
      }
    }

    const exitPoints = {};

    Object.keys(entryPoints).forEach((ep) => {
      const entry = entryPoints[ep];
      // now, check when this opportunity would have been closed
      for (let j = 10; j < ema_1h_candle.t.length; j++) {
        if (ema_1h_candle.t[j] <= entry.timeAt) continue; // we are only interested in future candles

        //profit closing
        if (
          ema_1h_candle.l[j - 1] > ema_1h_candle.ema[j - 1] &&
          ema_1h_candle.l[j - 1] > ema_1h_candle.c[j]
        ) {
          exitPoints[ep] = {
            profit: ema_1h_candle.c[j] * entry.units - entry.sum,
            sum: ema_1h_candle.c[j] * entry.units,
            exit: "exit rule",
            timeAt: ep,
            prettyTimeAt: prettyDate(ep),
          };
          break;
        }
        //loss closing
        if (ema_1h_candle.l[j] < entry.stopLoss) {
          exitPoints[ep] = {
            profit: ema_1h_candle.c[j] * entry.units - entry.sum,
            sum: ema_1h_candle.c[j] * entry.units,
            exit: "stopLoss",
          };
          break;
        }
      }
    });
    return [entryPoints, exitPoints];
  } catch (error) {
    throw new Error(error);
  }
}

module.exports = {
  backTrackStock,
};
