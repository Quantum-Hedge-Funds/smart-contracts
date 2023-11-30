import hre from "hardhat";

const chainlinkFunctionsRouter = "";

async function main() {
  const fundManager = await hre.viem.deployContract("FundManager", [
    chainlinkFunctionsRouter,
  ]);

  console.log(`Fund Manager is deployed to ${fundManager.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
