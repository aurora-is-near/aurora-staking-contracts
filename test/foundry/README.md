# JetStaking Foundry tests

This repository contains foundry tests for `jetStakingV1.sol` and `Treasury.sol` contract.

## Install Foundry 

Prerequisites:

- Node 14+
- Yarn
- Foundry

Run the following command in the terminal:

```bash
curl -L https://foundry.paradigm.xyz | bash
```

This will download foundryup. Then install Foundry by running:

```bash
foundryup
```

Then install the dependencies as follows:
```bash
yarn install
```


## Compile and test

Compile the contracts and run the tests using the following command:

```bash
yarn run forge-test
```
