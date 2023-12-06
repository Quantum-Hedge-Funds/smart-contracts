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
import { startSimulator } from "./chainlink-functions-simulators";
import { FundManager$Type } from "../artifacts/contracts/FundManager.sol/FundManager";
import { MockUniswapRouter$Type } from "../artifacts/contracts/test/MockUniswapRouter.sol/MockUniswapRouter";

type Contract<TAbi extends Abi | readonly unknown[]> = GetContractReturnType<
  TAbi,
  PublicClient<Transport, Chain>,
  WalletClient<Transport, Chain, Account>
>;

describe("Vault", function () {
  let wallets: WalletClient[];
  let publicClient: PublicClient;
  let functionsRouterAddress: `0x${string}`;

  let vault: Contract<Vault$Type["abi"]>;
  let usdc: Contract<MockERC20$Type["abi"]>;
  let vaultShare: Contract<IERC20$Type["abi"]>;
  let fundManager: Contract<FundManager$Type["abi"]>;
  let mockUniswapRouter: Contract<MockUniswapRouter$Type["abi"]>;

  const accounts: Account[] = [];

  this.beforeAll(async () => {
    wallets = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();

    for (const wallet of wallets) {
      if (wallet.account) accounts.push(wallet.account);
    }

    usdc = await viem.deployContract("MockERC20", []);

    functionsRouterAddress = await startSimulator({
      secrets: {
        pinataAPIKey: process.env.PINATA_API_KEY || "",
      },
    });

    fundManager = await viem.deployContract("FundManager", [
      functionsRouterAddress,
    ]);

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
});
