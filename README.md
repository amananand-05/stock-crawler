# Stock Crawler API

A Node.js Express API that crawls and provides real-time stock data from NSE and BSE exchanges via MoneyControl API. This application fetches stock information, manages symbol databases, and provides various analytical endpoints for Indian stock markets.

## Features

- 🔍 **Real-time Stock Data**: Fetch current stock information from NSE and BSE
- 📊 **Large Cap Analysis**: Get large-cap stocks based on market capitalization
- 📈 **Historical Data**: Retrieve stock history with EMA calculations  
- 🎯 **EMA-based Filtering**: Find stocks trading under specific EMA values
- 🏦 **Multi-Exchange Support**: Automatically tries NSE first, falls back to BSE
- 💾 **Symbol Database**: Maintains local database of stock symbols and metadata
- ⚡ **Async Operations**: Concurrent processing with rate limiting for API calls

## Technology Stack

- **Node.js** with Express.js framework
- **Axios** for HTTP requests
- **p-limit** for concurrent request management
- **MoneyControl API** as data source
- **File-based storage** for symbol databases

## Getting Started

### Prerequisites
- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd stock-crawler
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

The server will start on port 3000 by default. You can set a custom port using the `PORT` environment variable.

## API Endpoints

### Base URL
```
http://localhost:3000/api
```

### 1. Get Stock Information
**GET** `/api/stock?symbol={symbol}`

Fetches current stock information for a given symbol from NSE/BSE.

**Parameters:**
- `symbol` (required): Stock symbol (e.g., "RELIANCE", "TCS")

**Example:**
```bash
curl "http://localhost:3000/api/stock?symbol=RELIANCE"
```

**Response:**
```json
{
  "symbol": "RELIANCE",
  "price": 2456.75,
  "change": 23.45,
  "pchange": 0.97,
  "volume": 1234567,
  // ... other stock data
}
```

### 2. Sync Symbols Database
**GET** `/api/sync-symbols`

Fetches and synchronizes all available stock symbols and their metadata. This is typically run periodically to keep the local database updated.

**Note:** Currently disabled in code (`if (false)`) to prevent accidental mass API calls.

**Example:**
```bash
curl "http://localhost:3000/api/sync-symbols"
```

### 3. Get Large Cap Stocks
**GET** `/api/large-caps?cap={marketCap}`

Retrieves stocks with market capitalization above the specified threshold.

**Parameters:**
- `cap` (optional): Minimum market cap threshold (default: 100000 crores)

**Example:**
```bash
curl "http://localhost:3000/api/large-caps?cap=50000"
```

### 4. Get Stock History
**GET** `/api/get-stock-history?symbol={symbol}&candle_count={count}&candle_unit={unit}&ema={ema}`

Fetches historical stock data with optional EMA calculations.

**Parameters:**
- `symbol` (required): Stock symbol
- `candle_count` (required): Number of time units
- `candle_unit` (required): Time unit (e.g., "days", "months")
- `ema` (optional): EMA period for calculation

**Example:**
```bash
curl "http://localhost:3000/api/get-stock-history?symbol=RELIANCE&candle_count=30&candle_unit=days&ema=20"
```

### 5. Get Stocks Under EMA
**GET** `/api/get-under-ema?candle_count={count}&candle_unit={unit}&ema={ema}&cap={cap}`

Finds stocks trading below their specified EMA values.

**Parameters:**
- `candle_count` (required): Number of time units for EMA calculation
- `candle_unit` (required): Time unit (e.g., "days", "months")
- `ema` (required): EMA period
- `cap` (optional): Minimum market cap filter (default: 100000 crores)

**Example:**
```bash
curl "http://localhost:3000/api/get-under-ema?candle_count=20&candle_unit=days&ema=50&cap=10000"
```

## Data Storage

The application maintains two local JSON files:

- **`symbolsDb.json`**: Contains the complete database of available stock symbols
- **`symbolMetadata.json`**: Stores metadata and additional information for each symbol

These files are automatically created and updated when running symbol synchronization.

## Error Handling

The API includes comprehensive error handling:

- **500 Internal Server Error**: For unexpected server errors
- **Custom Error Messages**: Specific error details for debugging
- **Exchange Fallback**: Automatically tries BSE if NSE fails
- **Graceful Degradation**: Continues processing even if individual requests fail

## Rate Limiting

The application uses `p-limit` to control concurrent API requests to prevent overwhelming the MoneyControl API and getting rate-limited.

## Development

### Code Formatting
```bash
npm run prettier:fix
```

### Project Structure
```
stock-crawler/
├── app.js              # Main Express application
├── helpers.js          # Core business logic and API functions
├── package.json        # Dependencies and scripts
├── symbolsDb.json      # Symbol database (auto-generated)
├── symbolMetadata.json # Symbol metadata (auto-generated)
└── README.md          # This file
```

## Configuration

### Environment Variables
- `PORT`: Server port (default: 3000)

### Security Notes
⚠️ **Warning**: The HTTPS agent is configured with `rejectUnauthorized: false` for development purposes. This should be changed for production use.

## Usage Examples

### Basic Stock Lookup
```bash
# Get current RELIANCE stock price
curl "http://localhost:3000/api/stock?symbol=RELIANCE"

# Get TCS stock information  
curl "http://localhost:3000/api/stock?symbol=TCS"
```

### Market Analysis
```bash
# Find large-cap stocks (>50,000 crores)
curl "http://localhost:3000/api/large-caps?cap=50000"

# Find stocks trading below 20-day EMA
curl "http://localhost:3000/api/get-under-ema?candle_count=20&candle_unit=days&ema=20"
```

### Historical Analysis
```bash
# Get 30-day history with 20-period EMA for RELIANCE
curl "http://localhost:3000/api/get-stock-history?symbol=RELIANCE&candle_count=30&candle_unit=days&ema=20"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run prettier:fix` to format code
5. Submit a pull request

## License

ISC License

## Disclaimer

This application is for educational and research purposes only. Stock market data is provided by MoneyControl API. Please ensure compliance with their terms of service and consider implementing proper rate limiting and caching for production use.

**Important**: Always do your own research before making any investment decisions. This tool does not provide financial advice.


### sample curls:
1. get `/api/stock`
```text
curl --location 'http://localhost:3000/api/stock?symbol=TI01'
```
2. get `/api/large-caps`
```text
curl --location 'http://localhost:3000/api/large-caps?cap=100000' \
--header 'Content-Type: application/json'
```
3. get `/api/get-stock-history`
```text
curl --location 'http://localhost:3000/api/get-stock-history?symbol=VBL&candle_count=3&candle_unit=H&ema=5'
```
4. get `/api/get-under-ema`
```text
curl --location 'http://localhost:3000/api/get-under-ema?candle_count=1&candle_unit=D&ema=5&cap=100000'
```
5. get `/api/sync-symbols` (disabled in code)
```text
curl --location 'http://localhost:3000/api/sync-symbols' \
--header 'Content-Type: application/json'
```

6. get /api/future-less-than-current
```text
curl --location 'http://localhost:3000/api/future-less-than-current?cap=10000'
```
