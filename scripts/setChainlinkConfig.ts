import { viem } from "hardhat";

const fundManagerAddress = "0xf13887480011b84cb6f80474562ba786c5f29a5e";

const subscriptionId = 51n;

async function main() {
  const fundManager = await viem.getContractAt(
    "FundManager",
    fundManagerAddress
  );

  await fundManager.write.setSubscriptionId([subscriptionId]);

  await fundManager.write.setGasLimitForPriceFetchFunction([300000]);
  await fundManager.write.setGasLimitForScheduleOptimizationFunction([300000]);
  await fundManager.write.setGasLimitForResultFetch([300000]);
}

main().catch((err) => console.error(err));
