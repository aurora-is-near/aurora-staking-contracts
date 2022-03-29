import * as dotenv from 'dotenv';

import '@typechain/hardhat';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@openzeppelin/hardhat-upgrades';
import 'hardhat-deploy';
import 'solidity-coverage';

dotenv.config();

const {
  INFURA_KEY,
  // ALCHEMY_KEY,
  MNEMONIC,
  ETHERSCAN_API_KEY,
  PRIVATE_KEY,
  PRIVATE_KEY_TESTNET,
  AURORA_API_KEY,
} = process.env;

const accountsTestnet = PRIVATE_KEY_TESTNET
  ? [PRIVATE_KEY_TESTNET]
  : { mnemonic: MNEMONIC };

const accountsMainnet = PRIVATE_KEY
  ? [PRIVATE_KEY]
  : { mnemonic: MNEMONIC };

module.exports = {
  defaultNetwork: 'hardhat',
  solidity: {
    version: "0.8.10",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1
      }
    }
  },
  namedAccounts: {
    owner: {
      default: 0,
    },
  },
  networks: {
    hardhat: {},
    // hardhat: {
    //   forking: {
    //     url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`,
    //     blockNumber: Number(process.env.HARDHAT_FORKING_BLOCKNUMBER) || undefined,
    //     accounts: accountsTestnet
    //   }
    // },
    goerli: {
      url: `https://goerli.infura.io/v3/${INFURA_KEY}`,
      accounts: accountsTestnet,
    },
    auroraTestnet: {
      url: `https://testnet.aurora.dev/${AURORA_API_KEY}`,
      accounts: accountsTestnet
    },
    auroraMainnet: {
      url: `https://mainnet.aurora.dev/${AURORA_API_KEY}`,
      accounts: accountsMainnet
    }
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: ETHERSCAN_API_KEY,
  },
  allowUnlimitedContractSize: true,
};
