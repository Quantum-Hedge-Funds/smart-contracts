import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    polygonMumbai: {
      url: process.env.POLYGON_MUMBAI_RPC,
      accounts: [process.env.PRIVATE_KEY || ""],
    },
    polygonMainnet: {
      url: process.env.POLYGON_MAINNET_RPC,
      accounts: [process.env.PRIVATE_KEY || ""],
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: {
      polygon: process.env.POLYGONSCAN_API_KEY || "",
    },
  },
};

export default config;
