import { viem } from "hardhat";
import fs from "fs";

const fundManagerAddress = "0xf13887480011b84cb6f80474562ba786c5f29a5e";

async function main() {
  const fundManager = await viem.getContractAt(
    "FundManager",
    fundManagerAddress
  );

  const fetchPastPricesFunctionSourceCode = fs.readFileSync(
    "./chainlinkFunctions/fetchPastPrices.js"
  );

  await fundManager.write.setPriceFetchSourceCode([
    fetchPastPricesFunctionSourceCode.toString("utf-8"),
  ]);

  const scheduleOptimizationFunctionSourceCode = fs.readFileSync(
    "./chainlinkFunctions/scheduleOptimization.js"
  );

  await fundManager.write.setScheduleOptimizationSourceCode([
    scheduleOptimizationFunctionSourceCode.toString("utf-8"),
  ]);

  const fetchResultFunctionSourceCode = fs.readFileSync(
    "./chainlinkFunctions/fetchResult.js"
  );

  await fundManager.write.setResultFetchSourceCode([
    fetchResultFunctionSourceCode.toString("utf-8"),
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
