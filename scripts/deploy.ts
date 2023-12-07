import { viem } from "hardhat";

const chainlinkFunctionsRouter = "0xdc2AAF042Aeff2E68B3e8E33F19e4B9fA7C73F10";
const uniswapV2RouterAddress = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
const stableTokenAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const donId =
  "0x66756e2d706f6c79676f6e2d6d61696e6e65742d310000000000000000000000";
const donHostedSecretsVersion = 0n;
const donHostedSecretsSlotID = 0;

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

  await fundManager.write.setDONConfig([
    donHostedSecretsSlotID,
    donHostedSecretsVersion,
    donId,
  ]);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
