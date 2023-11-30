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
  Address,
  Transport,
  Chain,
  stringToHex,
  keccak256,
  stringToBytes,
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

  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployOneYearLockFixture() {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;

    const lockedAmount = parseGwei("1");
    const unlockTime = BigInt((await time.latest()) + ONE_YEAR_IN_SECS);

    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await hre.viem.getWalletClients();

    const lock = await hre.viem.deployContract("Lock", [unlockTime], {
      value: lockedAmount,
    });

    const publicClient = await hre.viem.getPublicClient();

    return {
      lock,
      unlockTime,
      lockedAmount,
      owner,
      otherAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.read.unlockTime()).to.equal(unlockTime);
    });

    it("Should set the right owner", async function () {
      const { lock, owner } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
    });

    it("Should receive and store the funds to lock", async function () {
      const { lock, lockedAmount, publicClient } = await loadFixture(
        deployOneYearLockFixture
      );

      expect(
        await publicClient.getBalance({
          address: lock.address,
        })
      ).to.equal(lockedAmount);
    });

    it("Should fail if the unlockTime is not in the future", async function () {
      // We don't use the fixture here because we want a different deployment
      const latestTime = BigInt(await time.latest());
      await expect(
        hre.viem.deployContract("Lock", [latestTime], {
          value: 1n,
        })
      ).to.be.rejectedWith("Unlock time should be in the future");
    });
  });

  describe("Withdrawals", function () {
    describe("Validations", function () {
      it("Should revert with the right error if called too soon", async function () {
        const { lock } = await loadFixture(deployOneYearLockFixture);

        await expect(lock.write.withdraw()).to.be.rejectedWith(
          "You can't withdraw yet"
        );
      });

      it("Should revert with the right error if called from another account", async function () {
        const { lock, unlockTime, otherAccount } = await loadFixture(
          deployOneYearLockFixture
        );

        // We can increase the time in Hardhat Network
        await time.increaseTo(unlockTime);

        // We retrieve the contract with a different account to send a transaction
        const lockAsOtherAccount = await hre.viem.getContractAt(
          "Lock",
          lock.address,
          { walletClient: otherAccount }
        );
        await expect(lockAsOtherAccount.write.withdraw()).to.be.rejectedWith(
          "You aren't the owner"
        );
      });

      it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
        const { lock, unlockTime } = await loadFixture(
          deployOneYearLockFixture
        );

        // Transactions are sent using the first signer by default
        await time.increaseTo(unlockTime);

        await expect(lock.write.withdraw()).to.be.fulfilled;
      });
    });

    describe("Events", function () {
      it("Should emit an event on withdrawals", async function () {
        const { lock, unlockTime, lockedAmount, publicClient } =
          await loadFixture(deployOneYearLockFixture);

        await time.increaseTo(unlockTime);

        const hash = await lock.write.withdraw();
        await publicClient.waitForTransactionReceipt({ hash });

        // get the withdrawal events in the latest block
        const withdrawalEvents = await lock.getEvents.Withdrawal();
        expect(withdrawalEvents).to.have.lengthOf(1);
        expect(withdrawalEvents[0].args.amount).to.equal(lockedAmount);
      });
    });
  });
});
