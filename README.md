# Aurora Staking smart contracts.
This repository contains the Aurora's staking and community treasury contracts. For more details about 
the specification, please refer to this [blogpost](https://forum.aurora.dev/t/aurora-staking-and-the-community-treasury/75).

There are a couple of roles that are needed for the contract deployment and management (admin keys):

- Deployer role: TBC
- Admin role: TBC
- Manager role: TBC

## Install

Prerequisites: 

- Node 14+

Then install the dependencies as follows:
```bash
npm i
```

## Compile

Before you compile the contracts, you should set the env vars:

```
cp .env.example .env
```
Update the enviroment variables which will be used in the `hardhat-config.js`. 

Then compile the contracts as follows:
```bash
npm run compile
```
## Test
To run the test:
```bash
npm run test
```
To get the test coverage: 

```
npm run coverage
```
## Deployment

```
npm run deploy:local # default hardhat network
npm run deploy:testnet # Aurora Testnet
npm run deploy:mainnet # Ethereum Mainnet
```
