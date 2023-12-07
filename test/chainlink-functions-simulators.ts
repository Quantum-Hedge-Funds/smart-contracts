import { viem } from "hardhat";
import { hexToBytes, encodePacked, encodeAbiParameters } from "viem";
import cbor from "cbor";
import { PublicClient, keccak256, stringToBytes } from "viem";

type DecodedData = Record<string, any>;

// {
//   codeLocation?: bigint;
//   language?: bigint;
//   source?: string;
//   args?: string[];
// }

const requestsPickedUp: Record<string, boolean> = {};
const requestsHandled: Record<string, boolean> = {};

export async function startSimulator({
  secrets,
}: {
  secrets: Record<string, string>;
}) {
  const functionsRouter = await viem.deployContract("MockFunctionsRouter");

  functionsRouter.watchEvent.RequestCreated({
    onLogs: async (logs) => {
      for (const log of logs) {
        const { data, requestId } = log.args;

        if (requestsPickedUp[requestId || "0x"]) continue;

        requestsPickedUp[requestId || "0x"] = true;

        const decodedCBORData = cbor.decodeAllSync(hexToBytes(data || "0x"));

        const decodedData: DecodedData = {};

        for (let i = 0; i < decodedCBORData.length / 2; i++) {
          const tag = decodedCBORData[i * 2];
          const value = decodedCBORData[i * 2 + 1];

          decodedData[tag] = value;
        }
        const code = `
        class Functions {
          static encodeString(s) {
            const strBuffer = Buffer.from(s);
            return strBuffer;
            // const len = (parseInt(strBuffer.length / 32) + Number(strBuffer.length % 32 > 0)) * 64;
            // const buf = Buffer.from(strBuffer.toString("hex").padEnd(len, "0"), "hex");
            // return Buffer.concat([Functions.encodeUint256(32), Functions.encodeUint256(strBuffer.length), buf]);
          }

          static encodeUint256(i) {
            return Buffer.from(i.toString(16).padStart(64, "0"), "hex")
          }
          
          static async makeHttpRequest({url, method, data, headers}) {
            try {

              const response = await fetch(url, {method: method || "GET", body: data ? JSON.stringify(data) : undefined, headers: headers || undefined});
              
              return {
                error: response.status >= 400,
                data: await response.json()
              }
            } catch (err) {
              return {error: true}
            }
          }
        }

        const secrets = ${JSON.stringify(secrets)};

        ${
          decodedData["args"]
            ? `const args = ${JSON.stringify(decodedData["args"])}`
            : ""
        }

        async function main() {
          ${decodedData["source"]}
        }
        
        main()
        `;

        try {
          const result = await eval(code);

          // const result = encodeAbiParameters([{ type: "string" }], values);
          // console.log(encodeAbiParameters([{ type: "uint256" }], [10n]));
          // console.log("result = ", result);
          // console.log("buffer = ", Buffer.from(values[0]).toString("hex"));
          console.log(result.toString("hex"));

          // console.log(result);
          const hash = await functionsRouter.write.fulfill([
            requestId || "0x",
            `0x${result.toString("hex")}`,
            "0x",
          ]);

          await waitForRequestHandling(
            await viem.getPublicClient(),
            await functionsRouter.read.requesters([requestId || "0x"]),
            hash
          );
        } catch (e) {
          console.log(e);
        }

        requestsHandled[requestId || "0x"] = true;
      }
    },
  });

  return functionsRouter.address;
}

export async function waitForRequestHandling(
  client: PublicClient,
  contractAddress: `0x${string}`,
  hash: `0x${string}`
) {
  console.log(contractAddress);
  console.log("A = ", hash);
  const receipt = await client.getTransactionReceipt({ hash });
  const topicId = keccak256(stringToBytes("RequestSent(bytes32)"));
  console.log("check = ", topicId);
  console.log("B = ", receipt.logs);
  const logs = receipt.logs.filter(
    (log) =>
      log.address.toLowerCase() === contractAddress.toLowerCase() &&
      log.topics[0]?.toLowerCase() === topicId.toLowerCase()
  );
  console.log("C = ", logs);

  for (const log of logs) {
    if (!log) throw "functions request not sent";

    const requestId = log.topics[1];
    if (!requestId) throw "invalid event emitted";

    let pickedUp = false;

    await new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (!pickedUp && requestsPickedUp[requestId]) {
          pickedUp = true;
          console.log(`Request id ${requestId} is picked up by the node`);
        }

        if (requestsHandled[requestId]) {
          clearInterval(interval);
          resolve(null);
        }
      }, 50);
    });
  }

  return;
}
