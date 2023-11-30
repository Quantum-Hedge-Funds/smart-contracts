import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre, { viem } from "hardhat";
import { getAddress, parseGwei } from "viem";
import {
  WalletClient,
  PublicClient,
  GetContractReturnType,
  Account,
  Transport,
  Chain,
  stringToHex,
} from "viem";
import {
  startSimulator,
  waitForRequestHandling,
} from "./chainlink-functions-simulators";
import { FundManager$Type } from "../artifacts/contracts/FundManager.sol/FundManager";
import fs from "fs";

const donId = "fun-polygon-mumbai-1";
const gasLimit = 300000;
const subscriptionId = 469;

const supportedTokens = [
  { symbol: "ethereum" },
  { symbol: "bnb" },
  { symbol: "solana" },
  { symbol: "aave" },
  { symbol: "chainlink" },
  { symbol: "avalanche" },
  { symbol: "compound" },
  { symbol: "the-graph" },
];

describe("Fund Manager", function () {
  let wallets: WalletClient[];
  let publicClient: PublicClient;
  let functionsRouterAddress: `0x${string}`;
  let fundManager: GetContractReturnType<
    FundManager$Type["abi"],
    PublicClient<Transport, Chain>,
    WalletClient<Transport, Chain, Account>
  >;
  const accounts: Account[] = [];

  this.beforeAll(async () => {
    wallets = await viem.getWalletClients();
    publicClient = await hre.viem.getPublicClient();

    for (const wallet of wallets) {
      if (wallet.account) accounts.push(wallet.account);
    }

    functionsRouterAddress = await startSimulator();

    fundManager = await viem.deployContract("FundManager", [
      functionsRouterAddress,
    ]);
  });

  it("Should update all the config variables", async () => {
    await fundManager.write.setDONConfig([
      0,
      0n,
      stringToHex(donId, { size: 32 }),
    ]);

    await fundManager.write.setGasLimit([gasLimit]);

    await fundManager.write.setSubscriptionId([BigInt(subscriptionId)]);

    // await fundManager.write.setEncryptedSecretUrls([stringToHex("")]);
  });

  it("Should make a request", async () => {
    const functionSourceCode = fs.readFileSync(
      "./chainlinkFunctions/fetchPastPrices.js"
    );
    const hash = await fundManager.write.makeRequest([
      functionSourceCode.toString(),
    ]);

    await waitForRequestHandling(publicClient, fundManager.address, hash);

    console.log(await fundManager.read.result());
  });

  it("Should add a token in the contract", async () => {
    await fundManager.write.addToken([accounts[1].address, "ethereum"]);

    const tokenList = JSON.parse(
      await fundManager.read.getJSONTokenSymbolList()
    );

    expect(tokenList).to.deep.eq({
      tokens: [{ id: 1, symbol: "ethereum" }],
    });
  });

  it("Should not add the token again in the contract if already there", async () => {
    await expect(
      fundManager.write.addToken([accounts[1].address, "ethereum"])
    ).to.be.rejectedWith("TokenAlreadyAdded");
  });

  it("Should remove a token from the contract", async () => {
    await fundManager.write.removeToken([accounts[1].address]);

    const tokenList = JSON.parse(
      await fundManager.read.getJSONTokenSymbolList()
    );

    expect(tokenList).to.deep.eq({
      tokens: [],
    });
  });

  it("Should be able to add a token in the contract after it was removed", async () => {
    await fundManager.write.addToken([accounts[1].address, "ethereum"]);

    const tokenList = JSON.parse(
      await fundManager.read.getJSONTokenSymbolList()
    );

    expect(tokenList).to.deep.eq({
      tokens: [{ id: 2, symbol: "ethereum" }],
    });
  });

  it("Should add some tokens", async () => {
    for (const supportedToken of supportedTokens.slice(1)) {
      const tokenContract = await viem.deployContract("MockERC20");

      await fundManager.write.addToken([
        tokenContract.address,
        supportedToken.symbol,
      ]);
    }

    const tokenList = JSON.parse(
      await fundManager.read.getJSONTokenSymbolList()
    );

    expect(tokenList).to.deep.eq({
      tokens: [
        { id: 2, symbol: "ethereum" },
        { id: 3, symbol: "bnb" },
        { id: 4, symbol: "solana" },
        { id: 5, symbol: "aave" },
        { id: 6, symbol: "chainlink" },
        { id: 7, symbol: "avalanche" },
        { id: 8, symbol: "compound" },
        { id: 9, symbol: "the-graph" },
      ],
    });
  });

  it("Should remove one token and add another", async () => {
    await fundManager.write.removeToken([accounts[1].address]);

    let tokenList = JSON.parse(await fundManager.read.getJSONTokenSymbolList());

    expect(tokenList).to.deep.eq({
      tokens: [
        { id: 9, symbol: "the-graph" },
        { id: 3, symbol: "bnb" },
        { id: 4, symbol: "solana" },
        { id: 5, symbol: "aave" },
        { id: 6, symbol: "chainlink" },
        { id: 7, symbol: "avalanche" },
        { id: 8, symbol: "compound" },
      ],
    });

    const tokenContract = await viem.deployContract("MockERC20");

    await fundManager.write.addToken([
      tokenContract.address,
      supportedTokens[0].symbol,
    ]);

    tokenList = JSON.parse(await fundManager.read.getJSONTokenSymbolList());

    expect(tokenList).to.deep.eq({
      tokens: [
        { id: 9, symbol: "the-graph" },
        { id: 3, symbol: "bnb" },
        { id: 4, symbol: "solana" },
        { id: 5, symbol: "aave" },
        { id: 6, symbol: "chainlink" },
        { id: 7, symbol: "avalanche" },
        { id: 8, symbol: "compound" },
        { id: 10, symbol: "ethereum" },
      ],
    });
  });
});
