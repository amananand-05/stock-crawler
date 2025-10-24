const express = require("express");

const {
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
  backTrack,
} = require("./helpers");

const {
  normalizeCandleWidth,
  addEmaToHistory,
  addSerial,
} = require("./common");

const { getNSECookie } = require("./nse");

const { backTrackStock } = require("./backTracker");

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());
app.use(async (req, res, next) => {
  await getNSECookie();
  next();
});

// Define routes
// =========================== PRODUCTION ===========================

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>📊 Stock Crawler API</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background: #f7f9fc;
          }
          h1 { color: #2b6cb0; }
          form {
            margin-bottom: 20px;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          }
          label { display: block; margin-top: 10px; font-weight: bold; }
          input, select {
            width: 100%;
            padding: 8px;
            margin-top: 5px;
            border: 1px solid #ccc;
            border-radius: 6px;
          }
          button {
            margin-top: 15px;
            background: #2b6cb0;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 6px;
            cursor: pointer;
          }
          button:hover { background: #2c5282; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 30px;
            background: white;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th { background: #f0f0f0; }
          pre { background: #f9f9f9; padding: 10px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <h1>📊 Sumit's Stock Scanner.</h1>

        <form id="apiForm">
          <label for="endpoint">Select Endpoint</label>
          <select id="endpoint" name="endpoint">
           
            <option value="/api/future-more-than-current">1. Future More Than Current</option>
            <option value="/api/future-less-than-current">2. Future Less Than Current</option>
            <option value="/api/get-ema-20-50-100-under-200">3. EMA (20 50 100) under 200</option>
            <option value="/api/rsi-more-than">4. RSI More Than</option>
            <option value="/api/rsi-less-than">5. RSI Less Than</option>
            <option value="/api/gap-up-gap-down">6. Gap-Up Gap-Down</option>
            <option value="/api/bt">x. Back Track</option>
            <!-- Uncomment others as needed
            <option value="/api/bt">x. Back Track</option>
            <option value="/api/stock">/api/stock</option>
            <option value="/api/large-caps">/api/large-caps</option>
            <option value="/api/get-stock-history">/api/get-stock-history</option>
            <option value="/api/get-under-ema">/api/get-under-ema</option>
            <option value="/api/back-track">/api/back-track</option>
            -->
          </select>

          <div id="paramsContainer"></div>

          <button type="submit">Fetch Data</button>
        </form>

        <div id="result"></div>

        <script>
          const endpointParams = {
            "/api/future-less-than-current": [
              { label: "Market Cap (in Crs)", name: "cap", placeholder: "number in Crs, like: 100000" }
            ],
            "/api/future-more-than-current": [
              { label: "Market Cap (in Crs)", name: "cap", placeholder: "number in Crs, like: 100000" }
            ],
            "/api/get-ema-20-50-100-under-200": [
              { label: "Market Cap (in Crs)", name: "cap", placeholder: "number in Crs, like: 100000" },
              { label: "(Optional) Candle Width in Days", name: "candle_width_in_days", placeholder: "default value 5" },
              { label: "(Optional) x % above EMA 200", name: "from_ema_200_plus_x_percent", placeholder: "default value of x is 0" }
            ],
            "/api/rsi-less-than": [
              { label: "Market Cap (in Crs)", name: "cap", placeholder: "number in Crs, like: 100000" },
              { label: "(Optional) Candle Width in Days", name: "candle_width_in_days", placeholder: "default value 5" },
              { label: "(Optional) RSI", name: "rsi", placeholder: "default value 9" },
              { label: "(Optional) Compare value", name: "compare_value", placeholder: "default value 20" }
            ],
            "/api/rsi-more-than": [
              { label: "Market Cap (in Crs)", name: "cap", placeholder: "number in Crs, like: 100000" },
              { label: "(Optional) Candle Width in Days", name: "candle_width_in_days", placeholder: "default value 5" },
              { label: "(Optional) RSI", name: "rsi", placeholder: "default value 9" },
              { label: "(Optional) Compare value", name: "compare_value", placeholder: "default value 70" }
            ],
            "/api/gap-up-gap-down": [
              { label: "Market Cap (in Crs)", name: "cap", placeholder: "number in Crs, like: 100000" },
              { label: "(Optional) Threshold %", name: "threshold_percent", placeholder: "default value 3" },
            ],
            "/api/bt" : [],
            "/api/stock": [
              { label: "Stock Symbol", name: "symbol", placeholder: "e.g. INFY" }
            ],
            "/api/large-caps": [
              { label: "Market Cap (in Crs)", name: "cap", placeholder: "Number in Crores" }
            ],
            "/api/get-stock-history": [
              { label: "Stock Symbol", name: "symbol", placeholder: "e.g. RELIANCE" },
              { label: "Candle Width", name: "candle_width", placeholder: "e.g. 1" },
              { label: "Candle Unit (days/hours)", name: "candle_unit", placeholder: "e.g. day" },
              { label: "EMA Value", name: "ema", placeholder: "e.g. 20" }
            ],
            "/api/get-under-ema": [
              { label: "Candle Width", name: "candle_width", placeholder: "e.g. 1" },
              { label: "Candle Unit", name: "candle_unit", placeholder: "day/hour" },
              { label: "EMA", name: "ema", placeholder: "e.g. 50" },
              { label: "Market Cap (in Crs)", name: "cap", placeholder: "e.g. 1000" }
            ],
            "/api/back-track": [
              { label: "Strategy", name: "strategy", placeholder: "e.g. swing" },
              { label: "Stock Symbol", name: "symbol", placeholder: "e.g. TCS" },
              { label: "Investment per Purchase", name: "investmentPerPurchase", placeholder: "e.g. 10000" },
              { label: "Percentage Change", name: "percentageChange", placeholder: "e.g. 5" }
            ]
          };

          const endpointSelect = document.getElementById("endpoint");
          const paramsContainer = document.getElementById("paramsContainer");
          const resultDiv = document.getElementById("result");
          const form = document.getElementById("apiForm");

          function renderParamInputs(endpoint) {
            paramsContainer.innerHTML = "";
            const params = endpointParams[endpoint] || [];
            if (params.length === 0) {
              paramsContainer.innerHTML = "<p>No parameters needed.</p>";
              return;
            }
            params.forEach(param => {
              const label = document.createElement("label");
              label.textContent = param.label;

              const input = document.createElement("input");
              input.name = param.name;
              input.placeholder = param.placeholder || param.label;

              paramsContainer.appendChild(label);
              paramsContainer.appendChild(input);
            });
          }

          endpointSelect.addEventListener("change", () => {
            renderParamInputs(endpointSelect.value);
          });

          // Initial render
          renderParamInputs(endpointSelect.value);

          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const endpoint = endpointSelect.value;
            const params = {};
            const inputs = paramsContainer.querySelectorAll("input");
            inputs.forEach(i => {
              if (i.value.trim()) params[i.name] = i.value.trim();
            });
            const queryString = new URLSearchParams(params).toString();
            const url = endpoint + (queryString ? "?" + queryString : "");

            resultDiv.innerHTML = "<p>Loading...</p>";

            try {
              const res = await fetch(url);
              const data = await res.json();

              if (Array.isArray(data) && data.length > 0) {
                const headers = Object.keys(data[0]);
                const table = document.createElement("table");

                const thead = document.createElement("thead");
                const trHead = document.createElement("tr");
                headers.forEach(h => {
                  const th = document.createElement("th");
                  th.textContent = h;
                  trHead.appendChild(th);
                });
                thead.appendChild(trHead);
                table.appendChild(thead);

                const tbody = document.createElement("tbody");
                data.forEach(row => {
                  const tr = document.createElement("tr");
                  headers.forEach(h => {
                    const td = document.createElement("td");
                    td.textContent = row[h];
                    tr.appendChild(td);
                  });
                  tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                resultDiv.innerHTML = "";
                resultDiv.appendChild(table);
              } else {
                resultDiv.innerHTML = "<pre>" + JSON.stringify(data, null, 2) + "</pre>";
              }

            } catch (err) {
              resultDiv.innerHTML = "<p style='color:red;'>Error: " + err.message + "</p>";
            }
          });
        </script>
      </body>
    </html>
  `);
});

app.get("/api/get-ema-20-50-100-under-200", async (req, res, next) => {
  try {
    const result = await getEma20_50_100_under_200(
      parseInt(req?.query?.cap),
      parseInt(req?.query?.candle_width_in_days ?? 5), // for a week
      parseInt(req?.query?.from_ema_200_plus_x_percent ?? 0), // for a week
    );
    addSerial(result);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/future-less-than-current", async (req, res, next) => {
  try {
    let result = await getAllFutureCompareToCurrent(
      parseInt(req.query.cap),
      "less",
    );
    result = result.sort((a, b) => a["change percent%"] - b["change percent%"]);
    addSerial(result);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/future-more-than-current", async (req, res, next) => {
  try {
    let result = await getAllFutureCompareToCurrent(
      parseInt(req.query.cap),
      "more",
    );
    result = result.sort((a, b) => b["change percent%"] - a["change percent%"]);
    addSerial(result);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/rsi-less-than", async (req, res, next) => {
  try {
    const result = await rsiCompTo(
      parseInt(req?.query?.cap),
      parseInt(req?.query?.candle_width_in_days ?? 5),
      parseInt(req?.query?.rsi ?? 9),
      parseInt(req?.query?.compare_value ?? 20),
      "below",
    );
    addSerial(result);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/gap-up-gap-down", async (req, res, next) => {
  try {
    let result = await getGapUpAndGapDown(
      parseInt(req?.query?.cap),
      parseFloat(req?.query?.threshold_percent ?? 3),
    );
    result = result.sort(
      (a, b) => b["open change percent%"] - a["open change percent%"],
    );
    addSerial(result);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/rsi-more-than", async (req, res, next) => {
  try {
    const result = await rsiCompTo(
      parseInt(req?.query?.cap),
      parseInt(req?.query?.candle_width_in_days ?? 5),
      parseInt(req?.query?.rsi ?? 9),
      parseInt(req?.query?.compare_value ?? 70),
      "above",
    );
    addSerial(result);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/bt", async (req, res, next) => {
  try {
    const result = await backTrack();
    addSerial(result);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({
    // error: "Something went wrong!",
    message: error.message,
  });
});

// =========================== NOT IN USE ===========================

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
      parseInt(req.query.candle_width),
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
      req.query.strategy,
      req.query.symbol, // NSEID
      req.query.investmentPerPurchase,
      req.query.percentageChange,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// Load ESM modules, then start server
loadModules()
  .then(() => {
    app.listen(port, () => {
      console.log(`👋 Hii... there!`);
      console.log(`🚀 Stock Crawler API server running on port ${port}`);
      console.log(`📊 Available endpoints:`);
      console.log(`   GET    /api/stock?symbol=:id          - Get stock info`);
      console.log(
        `   GET    /api/sync-symbols              - Fetch and sync all symbols`,
      );
      console.log(
        `   GET    /api/large-caps                - Fetch large-caps stocks`,
      );
      console.log(
        `   GET    /api/get-stock-history         - Get stock history with EMA`,
      );
      console.log(
        `   GET    /api/get-under-ema             - Get stocks under EMA`,
      );

      console.log(
        `   GET    /api/future-less-than-current  - Get future stocks less than current`,
      );
      console.log(
        "   NEW:\n\t curl --location 'http://localhost:3000/api/future-less-than-current?cap=100000' \n",
      );

      console.log(
        `   GET    /api/back-track                - Back track stock data`,
      );
    });
  })
  .catch((err) => {
    console.error("Failed to load modules:", err);
    process.exit(1);
  });

module.exports = app;
