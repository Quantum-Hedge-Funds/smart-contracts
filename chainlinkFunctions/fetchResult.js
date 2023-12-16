const jobId = args[0];

const oracleAPIKey = secrets["oracleAPIKey"];

async function fetchResult() {
  const apiResponse = await Functions.makeHttpRequest({
    url: `https://api-production-5752.up.railway.app/get-diversification-result`,
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${oracleAPIKey}`,
    },
    data: jobId,
  });
  console.log(JSON.stringify(apiResponse));
  if (apiResponse.error) {
    throw "api request failed";
  }
  const { data } = apiResponse;

  console.log("hello = ", data);
  return data;
}

function formatDataInBuffers(data) {
  const entries = data.length;
  const buffers = [Functions.encodeUint256(entries)];
  for (let i = 0; i < entries; i++) {
    buffers.push(Functions.encodeUint256(data[i].id));
    buffers.push(Functions.encodeUint256(data[i].weight));
  }
  return Buffer.concat(buffers);
}

const data = formatDataInBuffers(await fetchResult());

console.log(data.toString("hex"));

return data;
