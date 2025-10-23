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

module.exports = {
  agent,
  // getEMA,
  addEmaToHistory,
  normalizeCandleWidth,
  addSerial,
};
