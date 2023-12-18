const tokens = JSON.parse(args[0]).tokens;
const pinataAPIKey = secrets["pinataAPIKey"];

console.log(tokens);

async function getTokenPrices() {
  const prices = [];

  for (let token of tokens) {
    const apiResponse = await Functions.makeHttpRequest({
      url: `https://api.coingecko.com/api/v3/coins/${token.symbol}/market_chart?vs_currency=usd&days=15&interval=daily`,
    });
    if (apiResponse.error) {
      continue;
    }
    const { data } = apiResponse;
    const priceData = data.prices.map((price) => price[1]);
    prices.push({ ...token, prices: priceData });
  }

  return await uploadJSONToIPFS(prices);
}

async function uploadJSONToIPFS(obj) {
  const apiResponse = await Functions.makeHttpRequest({
    url: "https://api-production-e08a.up.railway.app/upload-json-to-ipfs",
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    data: obj,
  });

  if (apiResponse.error) {
    throw "Error while saving the price data to ipfs";
  }

  const { data } = apiResponse;
  return data;
}

return Functions.encodeString(await getTokenPrices());
