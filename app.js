const express = require("express");

const {
  loadModules,
  getSymbolCurrInfo,
  accAndPersistSymbols,
  syncSymbolsMetadata,
  getLargeCaps,
  getStockHistory,
  getUnderEMA,
} = require("./helpers");

const { backTrackStock } = require("./backTracker");

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Define routes
app.get("/api/stock", async (req, res, next) => {
  try {
    const symbol = req.query.symbol;
    const data = await getSymbolCurrInfo(symbol);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

app.get("/api/sync-symbols", async (req, res, next) => {
  try {
    // it should be done once in a while
    if (false) {
      await accAndPersistSymbols();
      await syncSymbolsMetadata();
    } else {
      return res.status(200).json("sync skipped");
    }
    res.status(200).json(true);
  } catch (error) {
    next(error);
  }
});

app.get("/api/large-caps", async (req, res, next) => {
  try {
    const result = await getLargeCaps(req.query.cap);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/get-stock-history", async (req, res, next) => {
  try {
    const result = await getStockHistory(
      req.query.symbol,
      req.query.candle_width,
      req.query.candle_unit,
      req.query.ema,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/get-under-ema", async (req, res, next) => {
  try {
    const result = await getUnderEMA(
      req.query.candle_width,
      req.query.candle_unit,
      req.query.ema,
      req.query.cap,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/back-track", async (req, res, next) => {
  try {
    const result = await backTrackStock(
      req.query.statergy,
      req.query.symbol, // NSEID
      req.query.investmentPerPurchase,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message: error.message,
  });
});

// Load ESM modules, then start server
loadModules()
  .then(() => {
    app.listen(port, () => {
      console.log(`👋 Hii... there!`);
      console.log(`🚀 Stock Crawler API server running on port ${port}`);
      console.log(`📊 Available endpoints:`);
      console.log(`   GET    /api/stock?symbol=:id      - Get stock info`);
      console.log(
        `   GET    /api/sync-symbols          - Fetch and sync all symbols`,
      );
      console.log(
        `   GET    /api/large-caps            - Fetch large-caps stocks`,
      );
      console.log(
        `   GET    /api/get-stock-history     - Get stock history with EMA`,
      );
      console.log(
        `   GET    /api/get-under-ema         - Get stocks under EMA`,
      );
      console.log(`   GET    /api/back-tract         - Back track stock data`);
    });
  })
  .catch((err) => {
    console.error("Failed to load modules:", err);
    process.exit(1);
  });

module.exports = app;
