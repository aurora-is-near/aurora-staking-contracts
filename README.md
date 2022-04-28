# Aurora Staking smart contracts.
This repository contains the Aurora's staking and community treasury contracts.

## Install

Prerequisites: 

- Node 14+
- Yarn

Then install the dependencies as follows:
```bash
yarn install
```

## Compile

Before you compile the contracts, you should set the env vars:

```
cp .env.example .env
```
Update the enviroment variables which will be used in the `hardhat-config.js`. 

Then compile the contracts as follows:
```bash
yarn compile
```
## Test
To run the test:
```bash
yarn test
```
To get the test coverage: 

```
yarn coverage
```
## Deployment

For more details about the deployment and the supported network, check out this [doc](deployments/README.md).
### Generate docs
Execute the following command to regenerate the contracts documentation:
```
yarn generate:doc
```
Then check out the [index.html](docs/index.html).

## Docs
 - [High level Architecture](docs/README.md)