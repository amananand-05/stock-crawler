async function backTrackStock(
  statergy,
  symbol, // NSEID
  investmentPerPurchase,
) {
  if (!statergy || !symbol || !investmentPerPurchase)
    throw new Error(
      "Please provide:" +
        " (statergy: like - '3H-1H-EMA')" +
        " (symbol: NSEID, like - TITAN)" +
        " (investmentPerPurchase: how much you will spend in per purchase, like - 10000)",
    );
  let result = {};
  switch (statergy) {
    case "3H-1H-EMA":
      result = await backTrackStock3H1HEMA(
        statergy,
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
  statergy,
  symbol, // NSEID
  investmentPerPurchase,
) {
  console.log("here");
  return true;
}

module.exports = {
  backTrackStock,
};
