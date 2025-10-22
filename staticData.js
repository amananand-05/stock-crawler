const fs = require("fs/promises");
const path = require("path");

// Path to the symbols database and metadata file

const symbolMetadataPath = path.join(__dirname, "symbolMetadata.json");

// Load the symbols from symbolsDb.json
async function getLargeCaps(cap = undefined) {
  try {
    if (!cap || typeof cap !== "number")
      throw new Error("Please provide Market Cap (number in Crs)");
    const data = await fs.readFile(symbolMetadataPath, "utf-8");
    let metadata = JSON.parse(data);
    return (
      metadata
        .filter((x) => (x.BSEID || x.NSEID) && x.exchange && x.exchange !== "-")
        // .filter((x) => !x.exchange)
        .filter((x) =>
          x.MKTCAP ? typeof x.MKTCAP === "number" && x.MKTCAP > cap : false,
        )
        .map((x) => {
          return {
            "Market Capital": x.MKTCAP,
            "Full Name": x.SC_FULLNM,
            Name: x.company,
            NSEID: x.NSEID,
            BSEID: x.BSEID,
            MKTCAP: x.MKTCAP,
            exchange: x.exchange,
            symbol: x.symbol,
          };
        })
    );
  } catch (error) {
    console.error("Error loading symbols:", error.message);
    throw error;
  }
}

module.exports = {
  getLargeCaps,
};
