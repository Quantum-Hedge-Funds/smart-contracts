import { expect } from "chai";
import hre, { viem } from "hardhat";
import {
  WalletClient,
  PublicClient,
  GetContractReturnType,
  Account,
  Transport,
  Chain,
  stringToHex,
  zeroAddress,
  keccak256,
  encodePacked,
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

    functionsRouterAddress = await startSimulator({
      secrets: {
        pinataAPIKey: process.env.PINATA_API_KEY || "",
      },
    });

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

    await fundManager.write.setGasLimitForPriceFetchFunction([gasLimit]);

    await fundManager.write.setSubscriptionId([BigInt(subscriptionId)]);

    // await fundManager.write.setEncryptedSecretUrls([stringToHex("")]);
  });

  it("Should add a token in the contract", async () => {
    await fundManager.write.addToken([
      accounts[1].address,
      zeroAddress,
      "ethereum",
    ]);

    const tokenList = JSON.parse(
      (await fundManager.read.getJSONTokenSymbolList([10n]))[0]
    );

    expect(tokenList).to.deep.eq({
      tokens: [{ id: 1, symbol: "ethereum" }],
    });
  });

  it("Should not add the token again in the contract if already there", async () => {
    await expect(
      fundManager.write.addToken([accounts[1].address, zeroAddress, "ethereum"])
    ).to.be.rejectedWith("TokenAlreadyAdded");
  });

  it("Should remove a token from the contract", async () => {
    await fundManager.write.removeToken([accounts[1].address]);

    expect(
      (await fundManager.read.getJSONTokenSymbolList([10n])).length
    ).to.be.eq(0);
  });

  it("Should be able to add a token in the contract after it was removed", async () => {
    await fundManager.write.addToken([
      accounts[1].address,
      zeroAddress,
      "ethereum",
    ]);

    const tokenList = JSON.parse(
      (await fundManager.read.getJSONTokenSymbolList([10n]))[0]
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
        zeroAddress,
        supportedToken.symbol,
      ]);
    }

    const tokenList = JSON.parse(
      (await fundManager.read.getJSONTokenSymbolList([10n]))[0]
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

    let tokenList = JSON.parse(
      (await fundManager.read.getJSONTokenSymbolList([10n]))[0]
    );

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
      zeroAddress,
      supportedTokens[0].symbol,
    ]);

    tokenList = JSON.parse(
      (await fundManager.read.getJSONTokenSymbolList([10n]))[0]
    );

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

  it("Should update the functions source code", async () => {
    const fetchPastPricesFunctionSourceCode = fs.readFileSync(
      "./chainlinkFunctions/fetchPastPrices.js"
    );

    await fundManager.write.setPriceFetchSourceCode([
      fetchPastPricesFunctionSourceCode.toString("utf-8"),
    ]);

    expect(await fundManager.read.priceFetchSourceCode()).to.be.eq(
      fetchPastPricesFunctionSourceCode.toString("utf-8")
    );

    const scheduleOptimizationFunctionSourceCode = fs.readFileSync(
      "./chainlinkFunctions/scheduleOptimization.js"
    );

    await fundManager.write.setScheduleOptimizationSourceCode([
      scheduleOptimizationFunctionSourceCode.toString("utf-8"),
    ]);

    expect(await fundManager.read.scheduleOptimizationSourceCode()).to.be.eq(
      scheduleOptimizationFunctionSourceCode.toString("utf-8")
    );

    const fetchResultFunctionSourceCode = fs.readFileSync(
      "./chainlinkFunctions/fetchResult.js"
    );

    await fundManager.write.setResultFetchSourceCode([
      fetchResultFunctionSourceCode.toString("utf-8"),
    ]);

    expect(await fundManager.read.resultFetchSourceCode()).to.be.eq(
      fetchResultFunctionSourceCode.toString("utf-8")
    );
  });

  it("Should initiate proportion refresh", async () => {
    const hash = await fundManager.write.initiateProportionRefresh();

    await waitForRequestHandling(publicClient, fundManager.address, hash);

    expect(await fundManager.read.totalRefreshRequests()).to.be.eq(1n);
    const request = await fundManager.read.refreshRequests([1n]);
    expect(request[0]).to.be.eq(1n);
    expect(request[1]).to.be.eq(2n);
    expect(request[2]).to.be.eq(2n);
    expect(request[3]).to.be.eq(true);
    expect(request[4]).to.be.eq(keccak256(encodePacked(["uint256"], [2n])));
    expect(request[5]).to.be.eq(true);
    expect(request[6]).to.be.not.eq("");
    console.log(request);
    expect(request[7]).to.be.eq(false);

    // expect(await fundManager.read.requestTypes()).to.be.eq(
  });

  it("Should fetch the result", async () => {
    const hash = await fundManager.write.fetchData();

    await waitForRequestHandling(publicClient, fundManager.address, hash);

    const request = await fundManager.read.refreshRequests([1n]);

    expect(request[7]).to.be.eq(true);

    const totalWeights = await fundManager.read.totalWeights();
    // const expectedIds = [9n, 4n, 5n, 6n, 10n];

    for (let i = 0; i < Number(totalWeights); i++) {
      const weight = await fundManager.read.weights([BigInt(i)]);
      // expect(weight[1]).to.be.eq(expectedIds[i]);
      console.log(weight);
    }
  });
});
