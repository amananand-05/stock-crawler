const { getStockHistory, getNSESymbolHistory } = require("./helpers");

async function backTrackStock(
  strategy,
  symbol, // NSEID
  investmentPerPurchase,
  percentageChange,
) {
  if (!strategy)
    throw new Error(
      "Please provide:" +
        " (strategy: like - '3H-1H-EMA', 'GET-%-INDEX-CHANGE')",
    );

  let result = {};
  switch (strategy) {
    case "3H-1H-EMA":
      if (!strategy || !symbol || !investmentPerPurchase)
        throw new Error(
          "Please provide:" +
            " (symbol: NSEID, like - TITAN)" +
            " (investmentPerPurchase: how much you will spend in per purchase, like - 10000)",
        );
      result = await backTrackStock3H1HEMA(
        symbol, // NSEID
        investmentPerPurchase,
      );
      break;
    case "GET-%-INDEX-CHANGE":
      if (!strategy || !symbol || !percentageChange)
        throw new Error(
          "Please provide:" +
            " (symbol: NSEID, like - TITAN)" +
            " (percentageChange: like - 1 for 1% drop, -2 for -2% drop etc.)",
        );
      result = await getPercentIndexChange(symbol, percentageChange);
      break;
    default:
      throw new Error(
        "Please provide:" +
          " (strategy: like - '3H-1H-EMA', 'GET-%-INDEX-CHANGE')",
      );
  }
  return result;
}

const prettyDate = (time) => new Date(time).toLocaleString();

async function backTrackStock3H1HEMA(
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
          prettyTimeAt: prettyDate(timeAt * 1000),
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
            prettyTimeAt: prettyDate(ep * 1000),
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

async function getPercentIndexChange(symbol, percentageChange) {
  let nseSymbolHistory = await getNSESymbolHistory(symbol);

  nseSymbolHistory = nseSymbolHistory.grapthData.map((x) => {
    return { time: prettyDate(x[0]), closePrice: x[1] };
  });

  nseSymbolHistory[0].percChange = 0;
  nseSymbolHistory[0].preventClose = 0;
  let lastIndexPrice = 0;
  const invPerPurchase = 1000;
  let investment = 0;
  let units = 0;
  let investment_withsip = 0;
  let units_withsip = 0;
  for (let i = 1; i < nseSymbolHistory.length; i++) {
    if (i % 30 === 0) {
      const unit = parseFloat(invPerPurchase / nseSymbolHistory[i].closePrice);
      investment_withsip += unit * nseSymbolHistory[i].closePrice;
      units_withsip += unit;
    }
  }

  for (let i = 1; i < nseSymbolHistory.length; i++) {
    nseSymbolHistory[i].preventClose = nseSymbolHistory[i - 1].closePrice;
    nseSymbolHistory[i].percChange =
      ((nseSymbolHistory[i].closePrice - nseSymbolHistory[i - 1].closePrice) /
        nseSymbolHistory[i - 1].closePrice) *
      100;
    lastIndexPrice = nseSymbolHistory[i].closePrice;
  }
  nseSymbolHistory = nseSymbolHistory.filter(
    (x) => x.percChange <= percentageChange,
  );
  nseSymbolHistory.forEach((x) => {
    const unit = parseFloat(invPerPurchase / x.closePrice);
    investment += unit * x.closePrice;
    units = units + unit;
  });

  const currentValue = units * lastIndexPrice;
  const profit = currentValue - investment;
  return [
    {
      type: "withSip",
      investment: investment_withsip,
      units: units_withsip,
      currentValue: units_withsip * lastIndexPrice,
      profit: units_withsip * lastIndexPrice - investment_withsip,
      "profit%":
        ((units_withsip * lastIndexPrice - investment_withsip) /
          investment_withsip) *
        100,
    },
    {
      type: "withPercentageChange",
      investment,
      units,
      currentValue,
      profit,
      "profit%": (profit / investment) * 100,
    },
  ];
}

module.exports = {
  backTrackStock,
};
