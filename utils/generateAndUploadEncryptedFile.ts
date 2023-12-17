import axios from "axios";
import { Account, Chain, Transport, WalletClient } from "viem";
import { SecretsManager } from "./SecretManager";

export async function generateAndUploadEncryptedFile({
  walletClient,
  secrets,
  routerAddress,
  donId,
}: {
  walletClient: WalletClient<Transport, Chain, Account>;
  secrets: Record<string, string>;
  routerAddress: `0x${string}`;
  donId: string;
}): Promise<`0x${string}`> {
  const secretsManager = new SecretsManager({
    walletClient,
    functionsRouterAddress: routerAddress,
    donId: donId,
  });

  await secretsManager.initialize();

  const pinataAPIKey = process.env.PINATA_API_KEY || "";

  const encryptedSecretsObj = await secretsManager.encryptSecrets(secrets);

  const { data } = (await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    {
      pinataContent: encryptedSecretsObj,
      pinataOptions: { cidVersion: 1 },
      pinataMetadata: { name: "EncryptedCredentials.json" },
    },
    {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${pinataAPIKey}`,
      },
    }
  )) as unknown as {
    data: {
      IpfsHash: string;
      PinSize: number;
      Timestamp: string;
    };
  };
  const fileHash = data.IpfsHash;

  const secreturl = `https://gateway.pinata.cloud/ipfs/${fileHash}`;

  console.log(await secretsManager.verifyOffchainSecrets([secreturl]));

  const encryptedSecretsUrls = await secretsManager.encryptSecretsUrls([
    `https://gateway.pinata.cloud/ipfs/${fileHash}`,
  ]);

  return encryptedSecretsUrls;
}
