import { viem } from "hardhat";
import { hexToBytes } from "viem";
import cbor from "cbor";

type DecodedData = Record<string, any>;

// {
//   codeLocation?: bigint;
//   language?: bigint;
//   source?: string;
//   args?: string[];
// }

export async function startSimulator() {
  const functionsRouter = await viem.deployContract("MockFunctionsRouter");

  // const eventFilter = functionsRouter.createEventFilter.RequestCreated();
  functionsRouter.watchEvent.RequestCreated({
    onLogs: async (logs) => {
      for (const log of logs) {
        const { data } = log.args;

        const decodedCBORData = cbor.decodeAllSync(hexToBytes(data || "0x"));
        console.log(decodedCBORData);

        const decodedData: DecodedData = {};

        for (let i = 0; i < decodedCBORData.length / 2; i++) {
          const tag = decodedCBORData[i * 2];
          const value = decodedCBORData[i * 2 + 1];

          decodedData[tag] = value;
        }

        console.log(decodedData);

        const code = `class Functions {
          static encodeString(s) {
            return s
          }
        }

        const args = ${decodedData["args"]};

        function main() {
          ${decodedData["source"]}
        }
        
        main()
        `;

        const output = await eval(code);
        console.log(output);

        // if (data) console.log(await cbor.decodeAll(data, "cborseq"));
        // console.log(
        //   decodeAbiParameters(["string", "string", "string"], data)
        // );
      }
    },
  });

  return functionsRouter.address;
}
