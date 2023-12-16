import { viem } from "hardhat";
import { generateAndUploadEncryptedFile } from "../utils/generateAndUploadEncryptedFile";

const routerAddress = "0xdc2AAF042Aeff2E68B3e8E33F19e4B9fA7C73F10";
const fundManagerAddress = "0xf13887480011b84cb6f80474562ba786c5f29a5e";

const donId =
  "0x66756e2d706f6c79676f6e2d6d61696e6e65742d310000000000000000000000";

async function main() {
  const walletClient = (await viem.getWalletClients())[0];

  const pinataAPIKey = process.env.PINATA_API_KEY || "";

  const encryptedSecretsUrls = await generateAndUploadEncryptedFile({
    walletClient,
    donId,
    routerAddress,
    secrets: {
      pinataApiKey: pinataAPIKey,
    },
  });

  const fundManager = await viem.getContractAt(
    "FundManager",
    fundManagerAddress
  );

  await fundManager.write.setEncryptedSecretUrlsForPriceFetchFunction([
    encryptedSecretsUrls,
  ]);

  await fundManager.write.setEncryptedSecretUrlsForScheduleOptimizationFunction(
    [encryptedSecretsUrls]
  );

  await fundManager.write.setEncryptedSecretUrlsForResultFetchFunction([
    encryptedSecretsUrls,
  ]);

  console.log(encryptedSecretsUrls);
}

main().catch((err) => console.error(err));
