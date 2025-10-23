const https = require("https");
const { getLargeCaps } = require("./staticData");
// Create HTTPS agent (disable cert check for dev)
const agent = new https.Agent({
  rejectUnauthorized: false, // ⚠️ Only for development!
});
function getEMA(priceCurr, EMALast, periods = undefined) {
  if (!periods || periods <= 0)
    throw new Error('Invalid "periods" for EMA calculation');
  const multiplier = 2 / (periods + 1);
  return priceCurr * multiplier + EMALast * (1 - multiplier); // EMA_today
}

function normalizeCandleWidth(dataArrObject, candleWidth) {
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
        for (let i = 0; i < dataArrObject[key].length; i += candleWidth)
          result[key].push(dataArrObject[key][i]);
      } else if (key === "o") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candleWidth)
          result[key].push(dataArrObject[key][i]);
      } else if (key === "c") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candleWidth) {
          const window = dataArrObject[key].slice(i, i + candleWidth);
          result[key].push(window[window.length - 1]);
        }
      } else if (key === "h") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candleWidth)
          result[key].push(
            Math.max(...dataArrObject[key].slice(i, i + candleWidth)),
          );
      } else if (key === "l") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candleWidth)
          result[key].push(
            Math.min(...dataArrObject[key].slice(i, i + candleWidth)),
          );
      } else if (key === "v") {
        // timestamp
        result[key] = [];
        for (let i = 0; i < dataArrObject[key].length; i += candleWidth)
          result[key].push(
            dataArrObject[key]
              .slice(i, i + candleWidth)
              .reduce((total, num) => total + num, 0),
          );
      }
    });
    return result;
  }
}

function addEmaToHistory(normalizedData, emaPeriod) {
  if (normalizedData) {
    // calculate EMA
    if (normalizedData.c.length >= emaPeriod) {
      let emaValues = new Array(emaPeriod).fill(0);
      // Start by calculating the simple moving average (SMA) for the first 5 periods

      emaValues[emaPeriod - 1] =
        normalizedData.c
          .slice(0, emaPeriod)
          .reduce((sum, price) => sum + price, 0) / emaPeriod; // EMA for the 5th data point is the SMA
      // Now calculate the EMA for the rest of the data points
      for (let i = emaPeriod; i < normalizedData.c.length; i++) {
        emaValues[i] = getEMA(normalizedData.c[i], emaValues[i - 1], emaPeriod);
      }
      normalizedData[`ema${emaPeriod}`] = emaValues;
    }
    return normalizedData;
  }
}

function addSerial(arr) {
  let count = 1;
  arr.forEach((x) => {
    x["no."] = count;
    count++;
  });
}

function calculateRSI(values, period = 9) {
  const rsi = new Array(values.length).fill(null);
  let gains = 0;
  let losses = 0;

  // Calculate initial averages
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  gains /= period;
  losses /= period;

  rsi[period] = 100 - 100 / (1 + gains / losses);

  // Continue RSI calculation
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);

    gains = (gains * (period - 1) + gain) / period;
    losses = (losses * (period - 1) + loss) / period;

    const rs = losses === 0 ? 100 : gains / losses;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  return rsi;
}

function calculateWMA(values, period = 21) {
  const wma = new Array(values.length).fill(null);
  const weightSum = (period * (period + 1)) / 2;

  for (let i = period - 1; i < values.length; i++) {
    let weightedSum = 0;
    for (let j = 0; j < period; j++) {
      weightedSum += values[i - j] * (period - j);
    }
    wma[i] = weightedSum / weightSum;
  }

  return normalizeTo100(wma);
}
function normalizeTo100(values) {
  const valid = values.filter((v) => v != null);
  const min = Math.min(...valid);
  const max = Math.max(...valid);

  return values.map((v) =>
    v == null ? null : ((v - min) / (max - min)) * 100,
  );
}

module.exports = {
  agent,
  // getEMA,
  addEmaToHistory,
  normalizeCandleWidth,
  addSerial,
  calculateRSI,
  calculateWMA, // wrong function do not use
};
