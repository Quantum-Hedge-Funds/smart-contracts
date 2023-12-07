import { viem } from "hardhat";

const chainlinkFunctionsRouter = "0x6E2dc0F9DB014aE19888F539E59285D2Ea04244C";
const uniswapV2RouterAddress = "0x";
const stableTokenAddress = "0x";

async function main() {
  const fundManager = await viem.deployContract("FundManager", [
    chainlinkFunctionsRouter,
  ]);

  console.log(`Fund Manager is deployed to ${fundManager.address}`);

  const vault = await viem.deployContract("Vault", [
    stableTokenAddress,
    fundManager.address,
    uniswapV2RouterAddress,
  ]);

  console.log(`Vault Contract is deployed to ${vault.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
