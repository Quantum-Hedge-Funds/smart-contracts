import { viem } from "hardhat";
import { generateAndUploadEncryptedFile } from "../utils/generateAndUploadEncryptedFile";
import {
  Account,
  Chain,
  GetContractReturnType,
  PublicClient,
  Transport,
  WalletClient,
  getContract,
} from "viem";
import { abi as FundManagerABI } from "../artifacts/contracts/FundManager.sol/FundManager.json";
import { FundManager$Type } from "../artifacts/contracts/FundManager.sol/FundManager";

const routerAddress = "0x6E2dc0F9DB014aE19888F539E59285D2Ea04244C";
const donId = "fun-polygon-mumbai-1";
const fundManagerAddress = "0x";

async function main() {
  const walletClient = (await viem.getWalletClients())[0];
  const publicClient = await viem.getPublicClient();

  const pinataAPIKey = process.env.PINATA_API_KEY || "";

  const encryptedSecretsUrls = await generateAndUploadEncryptedFile({
    walletClient,
    donId,
    routerAddress,
    secrets: {
      pinataApiKey: pinataAPIKey,
    },
  });

  const fundManager = getContract({
    abi: FundManagerABI,
    address: fundManagerAddress,
    walletClient: walletClient,
    publicClient: publicClient,
  }) as unknown as GetContractReturnType<
    FundManager$Type["abi"],
    PublicClient<Transport, Chain>,
    WalletClient<Transport, Chain, Account>
  >;

  await fundManager.write.setEncryptedSecretUrlsForPriceFetchFunction([
    encryptedSecretsUrls,
  ]);

  console.log(encryptedSecretsUrls);
}

main().catch((err) => console.error(err));
