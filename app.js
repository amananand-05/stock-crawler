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

app.get("/api/future-less-than-current", async (req, res, next) => {
  try {
    const result = await getAllFutureCompareToCurrent(req.query.cap, "less");
    res
      .status(200)
      .json(result.sort((a, b) => a["change percent%"] - b["change percent%"]));
  } catch (error) {
    next(error);
  }
});

app.get("/api/future-more-than-current", async (req, res, next) => {
  try {
    const result = await getAllFutureCompareToCurrent(req.query.cap, "more");
    res
      .status(200)
      .json(result.sort((a, b) => b["change percent%"] - a["change percent%"]));
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

// app.get("/", (req, res) => {
//   res.send(`
//     <html>
//       <head>
//         <title>📊 Stock Crawler API</title>
//         <style>
//           body {
//             font-family: Arial, sans-serif;
//             padding: 20px;
//             background: #f7f9fc;
//           }
//           h1 { color: #2b6cb0; }
//           form {
//             margin-bottom: 20px;
//             padding: 20px;
//             background: white;
//             border-radius: 10px;
//             box-shadow: 0 2px 5px rgba(0,0,0,0.1);
//           }
//           label { display: block; margin-top: 10px; font-weight: bold; }
//           input, select {
//             width: 100%;
//             padding: 8px;
//             margin-top: 5px;
//             border: 1px solid #ccc;
//             border-radius: 6px;
//           }
//           button {
//             margin-top: 15px;
//             background: #2b6cb0;
//             color: white;
//             border: none;
//             padding: 10px 15px;
//             border-radius: 6px;
//             cursor: pointer;
//           }
//           button:hover { background: #2c5282; }
//           table {
//             width: 100%;
//             border-collapse: collapse;
//             margin-top: 30px;
//             background: white;
//           }
//           th, td {
//             border: 1px solid #ddd;
//             padding: 8px;
//             text-align: left;
//           }
//           th { background: #f0f0f0; }
//           pre { background: #f9f9f9; padding: 10px; border-radius: 6px; }
//         </style>
//       </head>
//       <body>
//         <h1>📊 Stock Crawler API Dashboard</h1>
//
//         <form id="apiForm">
//           <label for="endpoint">Select Endpoint</label>
//           <select id="endpoint" name="endpoint">
//             <!--
//             <option value="/api/stock">/api/stock</option>
//             <option value="/api/large-caps">/api/large-caps</option>
//             <option value="/api/get-stock-history">/api/get-stock-history</option>
//             <option value="/api/get-under-ema">/api/get-under-ema</option>
//             <option value="/api/back-track">/api/back-track</option>
//             -->
//             <option value="/api/future-less-than-current">/future-less-than-current</option>
//             <option value="/api/future-more-than-current">/future-more-than-current</option>
//           </select>
//
//           <label for="params">Query Parameters (JSON format)</label>
//           <input id="params" placeholder='{"symbol": "RELIANCE", "ema": 50}' />
//
//           <button type="submit">Fetch Data</button>
//         </form>
//
//         <div id="result"></div>
//
//         <script>
//           const form = document.getElementById("apiForm");
//           const resultDiv = document.getElementById("result");
//
//           form.addEventListener("submit", async (e) => {
//             e.preventDefault();
//             const endpoint = document.getElementById("endpoint").value;
//             let params = {};
//             try {
//               params = JSON.parse(document.getElementById("params").value || "{}");
//             } catch (err) {
//               alert("Invalid JSON in parameters!");
//               return;
//             }
//
//             const queryString = new URLSearchParams(params).toString();
//             const url = endpoint + (queryString ? "?" + queryString : "");
//
//             resultDiv.innerHTML = "<p>Loading...</p>";
//
//             try {
//               const res = await fetch(url);
//               const data = await res.json();
//
//               if (Array.isArray(data) && data.length > 0) {
//                 // Render as table
//                 const headers = Object.keys(data[0]);
//                 const table = document.createElement("table");
//
//                 const thead = document.createElement("thead");
//                 const trHead = document.createElement("tr");
//                 headers.forEach(h => {
//                   const th = document.createElement("th");
//                   th.textContent = h;
//                   trHead.appendChild(th);
//                 });
//                 thead.appendChild(trHead);
//                 table.appendChild(thead);
//
//                 const tbody = document.createElement("tbody");
//                 data.forEach(row => {
//                   const tr = document.createElement("tr");
//                   headers.forEach(h => {
//                     const td = document.createElement("td");
//                     td.textContent = row[h];
//                     tr.appendChild(td);
//                   });
//                   tbody.appendChild(tr);
//                 });
//                 table.appendChild(tbody);
//                 resultDiv.innerHTML = "";
//                 resultDiv.appendChild(table);
//               } else if (typeof data === "object") {
//                 resultDiv.innerHTML = "<pre>" + JSON.stringify(data, null, 2) + "</pre>";
//               } else {
//                 resultDiv.innerHTML = "<pre>" + data + "</pre>";
//               }
//
//             } catch (err) {
//               resultDiv.innerHTML = "<p style='color:red;'>Error: " + err.message + "</p>";
//             }
//           });
//         </script>
//       </body>
//     </html>
//   `);
// });
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
        <h1>📊 Sumit Stock Crawler API Dashboard</h1>

        <form id="apiForm">
          <label for="endpoint">Select Endpoint</label>
          <select id="endpoint" name="endpoint">
          <!--
            <option value="/api/stock">/api/stock</option>
            <option value="/api/large-caps">/api/large-caps</option>
            <option value="/api/get-stock-history">/api/get-stock-history</option>
            <option value="/api/get-under-ema">/api/get-under-ema</option>
            <option value="/api/back-track">/api/back-track</option>
            -->
            <option value="/api/future-less-than-current">Future Less Than Current</option>
            <option value="/api/future-more-than-current">Future More Than Current</option>
            
          </select>

          <div id="paramsContainer"></div>

          <button type="submit">Fetch Data</button>
        </form>

        <div id="result"></div>

        <script>
          const endpointParams = {
            "/api/stock": ["symbol"],
            "/api/large-caps": ["cap"],
            "/api/get-stock-history": ["symbol", "candle_width", "candle_unit", "ema"],
            "/api/get-under-ema": ["candle_width", "candle_unit", "ema", "cap"],
            "/api/future-less-than-current": ["cap"],
            "/api/future-more-than-current": ["cap"],
            "/api/back-track": ["strategy", "symbol", "investmentPerPurchase", "percentageChange"]
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
              label.textContent = param;
              const input = document.createElement("input");
              input.name = param;
              input.placeholder = param;
              paramsContainer.appendChild(label);
              paramsContainer.appendChild(input);
            });
          }

          endpointSelect.addEventListener("change", () => {
            renderParamInputs(endpointSelect.value);
          });

          // Render defaults
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
