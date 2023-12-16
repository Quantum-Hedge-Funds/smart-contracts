import { viem } from "hardhat";

type Address = `0x${string}`;

const supportedTokens: {
  tokenContract: Address;
  chainlinkUSDDataFeed: Address;
  symbol: string;
}[] = [
  {
    tokenContract: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    chainlinkUSDDataFeed: "0xF9680D99D6C9589e2a93a78A04A279e509205945",
    symbol: "ethereum",
  },
  {
    tokenContract: "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7",
    chainlinkUSDDataFeed: "0xDD229Ce42f11D8Ee7fFf29bDB71C7b81352e11be",
    symbol: "aavegotchi",
  },
  {
    tokenContract: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    chainlinkUSDDataFeed: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0",
    symbol: "matic-network",
  },
  {
    tokenContract: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
    chainlinkUSDDataFeed: "0x72484B12719E23115761D5DA1646945632979bB6",
    symbol: "aave",
  },
  {
    tokenContract: "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1",
    chainlinkUSDDataFeed: "0xd8d483d813547CfB624b8Dc33a00F2fcbCd2D428",
    symbol: "mimatic",
  },
];

const fundManagerAddress = "0xf13887480011b84cb6f80474562ba786c5f29a5e";

async function main() {
  const fundManager = await viem.getContractAt(
    "FundManager",
    fundManagerAddress
  );

  for (const token of supportedTokens) {
    await fundManager.write.addToken([
      token.tokenContract,
      token.chainlinkUSDDataFeed,
      token.symbol,
    ]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
