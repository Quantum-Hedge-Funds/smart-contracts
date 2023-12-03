import { viem } from "hardhat";
import { hexToBytes, encodePacked } from "viem";
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

  // const eventFilter = functionsRouter.createEventFilter.RequestCreated();
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
            return [["string"], [s]]
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
          const [types, values] = await eval(code);

          console.log(values);

          const result = encodePacked(types, values);
          await functionsRouter.write.fulfill([
            requestId || "0x",
            result,
            "0x",
          ]);
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
  const receipt = await client.getTransactionReceipt({ hash });
  const topicId = keccak256(stringToBytes("RequestSent(bytes32)"));
  const logs = receipt.logs.filter(
    (log) => log.address === contractAddress && log.topics[0] === topicId
  );

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
