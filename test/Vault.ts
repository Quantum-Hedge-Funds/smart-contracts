import {
  Abi,
  Account,
  Chain,
  GetContractReturnType,
  PublicClient,
  Transport,
  WalletClient,
  parseEther,
} from "viem";
import { Vault$Type } from "../artifacts/contracts/Vault.sol/Vault";
import { viem } from "hardhat";
import { MockERC20$Type } from "../artifacts/contracts/test/MockERC20.sol/MockERC20";
import { IERC20$Type } from "../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20";
import { expect } from "chai";
import { MockUniswapRouter$Type } from "../artifacts/contracts/test/MockUniswapRouter.sol/MockUniswapRouter";
import { MockFundManager$Type } from "../artifacts/contracts/test/MockFundManager.sol/MockFundManager";
import { MockAggregatorV3$Type } from "../artifacts/contracts/test/MockAggregatorV3.sol/MockAggregatorV3";

type Contract<TAbi extends Abi | readonly unknown[]> = GetContractReturnType<
  TAbi,
  PublicClient<Transport, Chain>,
  WalletClient<Transport, Chain, Account>
>;

const tokens: {
  symbol: string;
  decimals: number;
  price: bigint;
  distribution1: bigint;
  distribution2: bigint;
  contract?: Contract<MockERC20$Type["abi"]>;
  aggregator?: Contract<MockAggregatorV3$Type["abi"]>;
  timestamp?: bigint;
}[] = [
  {
    symbol: "aave",
    decimals: 8,
    price: BigInt(12.5 * 1e8),
    distribution1: 1000n,
    distribution2: 2000n,
  },
  {
    symbol: "a",
    decimals: 8,
    price: BigInt(50.5 * 1e8),
    distribution1: 2000n,
    distribution2: 1300n,
  },
  {
    symbol: "ab",
    decimals: 8,
    price: BigInt(10.5 * 1e8),
    distribution1: 2500n,
    distribution2: 2500n,
  },
  {
    symbol: "aab",
    decimals: 8,
    price: BigInt(9.5 * 1e8),
    distribution1: 500n,
    distribution2: 1500n,
  },
  {
    symbol: "aavc",
    decimals: 8,
    price: BigInt(14 * 1e8),
    distribution1: 4000n,
    distribution2: 2700n,
  },
];

describe("Vault", function () {
  let wallets: WalletClient[];
  let publicClient: PublicClient;

  let vault: Contract<Vault$Type["abi"]>;
  let usdc: Contract<MockERC20$Type["abi"]>;
  let vaultShare: Contract<IERC20$Type["abi"]>;
  let fundManager: Contract<MockFundManager$Type["abi"]>;
  let mockUniswapRouter: Contract<MockUniswapRouter$Type["abi"]>;

  const accounts: Account[] = [];

  this.beforeAll(async () => {
    wallets = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();

    for (const wallet of wallets) {
      if (wallet.account) accounts.push(wallet.account);
    }

    usdc = await viem.deployContract("MockERC20", []);

    fundManager = await viem.deployContract("MockFundManager");

    mockUniswapRouter = await viem.deployContract("MockUniswapRouter", [
      fundManager.address,
      usdc.address,
    ]);

    vault = await viem.deployContract("Vault", [
      usdc.address,
      fundManager.address,
      mockUniswapRouter.address,
    ]);

    const shareTokenAddress = await vault.read.shareToken();

    vaultShare = await viem.getContractAt("IERC20", shareTokenAddress);
  });

  it("Should mint some usdc tokens", async () => {
    await usdc.write.mint([accounts[0].address, parseEther("1000000")]);
    await usdc.write.mint([accounts[1].address, parseEther("1000000")]);
    await usdc.write.mint([accounts[2].address, parseEther("1000000")]);
    await usdc.write.mint([accounts[3].address, parseEther("1000000")]);
    await usdc.write.mint([accounts[4].address, parseEther("1000000")]);
    await usdc.write.mint([accounts[5].address, parseEther("1000000")]);
  });

  it("Should not deposit if the usdc is not approved", async () => {
    await expect(vault.write.deposit([parseEther("1000")])).to.be.rejectedWith(
      "Insufficient allowance"
    );
  });

  it("Should not deposit if insufficient usdc balance", async () => {
    await usdc.write.approve([vault.address, parseEther("100000000")]);

    await expect(
      vault.write.deposit([parseEther("100000000")])
    ).to.be.rejectedWith("Insufficient balance");
  });

  it("Should deposit some usdc in the vault contract", async () => {
    await vault.write.deposit([parseEther("100000")]);

    expect(await vaultShare.read.balanceOf([accounts[0].address])).to.be.eq(
      parseEther("100000")
    );
  });

  it("Should deposit some more tokens in the vault contract", async () => {
    await usdc.write.approve([vault.address, parseEther("100000000")], {
      account: accounts[1],
    });
    await vault.write.deposit([parseEther("100000")], { account: accounts[1] });

    expect(await vaultShare.read.balanceOf([accounts[1].address])).to.be.eq(
      parseEther("100000")
    );

    expect(await vault.read.calculateTotalValue()).to.be.eq(
      parseEther("200000")
    );
  });

  it("Should withdraw some tokens from the vault contract", async () => {
    await vault.write.withdraw([parseEther("10000")]);

    expect(await vaultShare.read.balanceOf([accounts[0].address])).to.be.eq(
      parseEther("90000")
    );

    expect(await vault.read.calculateTotalValue()).to.be.eq(
      parseEther("190000")
    );

    expect(await usdc.read.balanceOf([accounts[0].address])).to.be.eq(
      parseEther("910000")
    );
  });

  it("Should add some token distribution in the mock fund manager contract", async () => {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      const tokenContract = await viem.deployContract("MockERC20");
      const timestamp = BigInt(Math.floor(new Date().getTime() / 1000));

      const token1Aggregator = await viem.deployContract("MockAggregatorV3", [
        token.decimals,
        token.symbol,
        1n,
        1n,
        token.price,
        timestamp,
      ]);

      await fundManager.write.addToken([
        tokenContract.address,
        token1Aggregator.address,
        "token 1",
      ]);

      tokens[i].contract = tokenContract;
      tokens[i].aggregator = token1Aggregator;
      tokens[i].timestamp = timestamp;
    }

    const ids = [1n, 2n, 3n, 4n, 5n];
    const weights = tokens.map((token) => token.distribution1);

    await fundManager.write.updateTokens([ids, weights]);
  });

  it("Should rebalance", async () => {
    const initialBalanceOfUsd = await usdc.read.balanceOf([vault.address]);

    expect(initialBalanceOfUsd).to.be.eq(parseEther("190000"));

    await vault.write.rebalance();

    const finalBalanceOfUsd = await usdc.read.balanceOf([vault.address]);
    expect(finalBalanceOfUsd).to.be.eq(0n);

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.contract) return;

      const expectedBalance =
        (initialBalanceOfUsd * token.distribution1 * BigInt(1e18)) /
        (BigInt(10 ** (22 - token.decimals)) * token.price);

      const tokenBalance = await token.contract.read.balanceOf([vault.address]);
      expect(tokenBalance).to.be.eq(expectedBalance);
    }
  });

  it("Should update the token distribution", async () => {
    const ids = [1n, 2n, 3n, 4n, 5n];
    const weights = tokens.map((token) => token.distribution2);

    await fundManager.write.updateTokens([ids, weights]);
  });

  it("Should rebalance again", async () => {
    const equivalentValue = await vault.read.calculateTotalValue();

    await vault.write.rebalance();

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.contract) return;

      const expectedBalance =
        (equivalentValue * token.distribution2 * BigInt(1e18)) /
        (BigInt(10 ** (22 - token.decimals)) * token.price);

      const tokenBalance = await token.contract.read.balanceOf([vault.address]);
      expect(tokenBalance).to.be.eq(expectedBalance);
    }
  });

  it("Should withdraw some tokens", async () => {
    const initialTokenBalancesOfContract: bigint[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.contract) return;

      const tokenBalance = await token.contract.read.balanceOf([vault.address]);
      initialTokenBalancesOfContract.push(tokenBalance);
    }

    await vault.write.withdraw([parseEther("10000")]);

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.contract) return;

      const initialBalance = initialTokenBalancesOfContract[i];
      const currentBalance = await token.contract.read.balanceOf([
        vault.address,
      ]);

      const difference = initialBalance - currentBalance;
      expect(difference / initialBalance == 1n / 19n).to.be.true;

      expect(
        await token.contract.read.balanceOf([accounts[0].address])
      ).to.be.eq(difference);
    }
  });
});
