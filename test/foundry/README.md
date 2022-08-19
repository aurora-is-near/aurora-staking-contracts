# JetStaking Foundry tests.
This repository contains foundry tests for the aurora jetStakingV1.sol contract.

## Install Foundry

Prerequisites: 

Run the following command in the terminal:
```
curl -L https://foundry.paradigm.xyz | bash
```
This will download foundryup. Then install Foundry by running:
```
foundryup
```

## Compile

Compile the contracts using the following command:
```bash
forge build
```
## Test
To run the test:
```bash
forge test
```
To run test in forked environment: 
```
forge test --rpc-url <your_rpc_url>
```

