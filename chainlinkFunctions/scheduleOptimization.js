const totalTokenBatches = Number(args[0]);
const tokenBatches = [];
for (let i = 0; i < totalTokenBatches; i++) {
  tokenBatches.push(args[i + 1]);
}

const oracleAPIKey = secrets["oracleAPIKey"];

async function scheduleOptimization() {
  const apiResponse = await Functions.makeHttpRequest({
    url: `https://api-production-e08a.up.railway.app/diversify`,
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${oracleAPIKey}`,
    },
    data: {
      hashes: tokenBatches,
    },
  });
  console.log(JSON.stringify(apiResponse));
  if (apiResponse.error) {
    throw "api request failed";
  }
  const { data } = apiResponse;

  console.log("hello = ", data);
  return data;
}

return Functions.encodeString(await scheduleOptimization());
