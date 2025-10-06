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
    // const result = await getStockHistory(
    //   req.query.symbol,
    //   req.query.candle_width,
    //   req.query.candle_unit,
    //   req.query.ema,
    // );
    return true;
  } catch (error) {
    throw new Error(error);
  }
}

module.exports = {
  backTrackStock,
};
