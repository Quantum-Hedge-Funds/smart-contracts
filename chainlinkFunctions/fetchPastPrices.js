const tokens = JSON.parse(args[0]).tokens;
const pinataAPIKey = secrets["pinataAPIKey"];

async function getTokenPrices() {
  const prices = [];

  for (let token of tokens) {
    const apiResponse = await Functions.makeHttpRequest({
      url: `https://api.coingecko.com/api/v3/coins/${token.symbol}/market_chart?vs_currency=usd&days=60&interval=daily`,
    });
    console.log(apiResponse.error);
    if (apiResponse.error) {
      continue;
    }
    const { data } = apiResponse;
    const priceData = data.prices.map((price) => ({
      date: new Date(price[0]),
      value: price[1],
    }));
    prices.push({ ...token, prices: priceData });
  }

  console.log(prices);

  return await uploadJSONToIPFS(prices);
}

async function uploadJSONToIPFS(obj) {
  const apiResponse = await Functions.makeHttpRequest({
    url: "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${pinataAPIKey}`,
    },
    data: {
      pinataContent: obj,
      pinataOptions: { cidVersion: 1 },
      pinataMetadata: { name: "data.json" },
    },
  });

  console.log(apiResponse);

  if (apiResponse.error) {
    throw "Error while saving the price data to ipfs";
  }

  const { data } = apiResponse;
  return data.IpfsHash;
}

return Functions.encodeString(await getTokenPrices());
