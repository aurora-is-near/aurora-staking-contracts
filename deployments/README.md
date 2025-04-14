# Deployment 

Before calling `yarn deploy:<NETWORK>`. The deployer should follow the steps below.

### Configurateion

Update the environment variables as follows:

```bash
cp .env.example .env
```

Update the `.env` file:

```bash
INFURA_KEY= # Goerli testing.
ETHERSCAN_API_KEY= # Mainly is required in case of verifying the contracts on Etherscan
PRIVATE_KEY= # the private key will be used as a deployer address, for the upgrade (if it has a default admin role) and for stream management (if it is stream manager or stream owner).
MNEMONIC= # This is an alternative for the private key (the deployer address is the first address)
AURORA_API_KEY= # AURORA API KEY
AURORA_TOKEN= # Aurora token address (not needed in case of testing)
FLAGS=0 # pause flag 
SCHEDULE_PERIOD=7890000 # 3 months in seconds, the duration of schedule periods.
TAU_PER_STREAM=172800 # 2 days in seconds
MIN_WEIGHT=256 # min weighting factor for streams
MAX_WEIGHT=1024 # max weighting factor for streams
AURORA_STREAM_OWNER= # AURORA stream owner (default first account)
SCHEDULE_START_TIME= # schedule start time
DEFAULT_ADMIN_ROLE_ADDRESS= # Default admin role address both treasury and staking contracts
PAUSER_ROLE_ADDRESS= # pausing role address is used for both treasury and staking contracts
AIRDROP_ROLE_ADDRESS= # airdrop role address is used only for the staking contract
TREASURY_MANAGER_ROLE_ADDRESS= # treasury manager role address(only for the treasury contract)
STREAM_MANAGER_ROLE_ADDRESS= # stream manager role address (only for the staking contract)
CLAIM_ROLE_ADDRESS= # claim role address (only for the staking contract)
```

### Deploy

```bash
yarn deploy:local # default hardhat network
yarn deploy:auroraTestnet # Aurora Testnet
yarn deploy:auroraMainnet # Aurora Mainnet
```

## Aurora Mainnet

Please update the following tables after the official mainnet deployment:

The mainnet deployment: 
| Contract Name          |Contract Address                            |
| ---------------------- |:------------------------------------------:|
| Treasury               | 0xF075c896CbbB625E7911E284cD23EE19bdCCf299 |
| JetStakingV1           | 0xccc2b1aD21666A5847A804a73a41F904C4a4A0Ec |

The mainnet admin keys:

| Role                  | Role Manager Address          |
| ---------------------- |:---------------------------------------:|
| Default Admin role      | TBD |
| Pause role      | TBD     |
| Airdrop role      | TBD     |
| Treasury manager role      | TBD     |
| Stream manager role      | TBD     |


## Aurora Testnet
Please update the following tables after the official staging deployment:

The testnet deployment: 
| Contract Name                  |Contract Address           |
| ---------------------- |:---------------------------------------:|
| Treasury      | TBD |
| JetStakingV1      | TBD     |


| Role                  | Role Manager Address          |
| ---------------------- |:---------------------------------------:|
| Default Admin role      | TBD |
| Pause role      | TBD     |
| Airdrop role      | TBD     |
| Treasury manager role      | TBD     |
| Stream manager role      | TBD     |


## Upgrading contracts

These are the steps required by the deployer/upgrader in order to upgrade the contracts:
- Make sure that you have set the right the default admin role private key to sign the upgrade transaction.
```bash
#.env file
PRIVATE_KEY= # the private key will be used for the deployment and the upgrade, replace this address with the default-admin-role private key in case it doesn't have assigned to a default-admin-role.
```
- Update the `contract proxy address` and the `new contract name` in `scripts/upgrade.js`. You can find them in the deployment logs.
- Execute `yarn upgrade:<NETWORK>`

## Proposing streams (Aurora Labs)

- Make sure that the JetStakingV1.json staking contract deployment information is correct in ./deployments/auroraMainnet.
- Provide environment variables:
```bash
#.env file
PRIVATE_KEY= # The stream manager private key.
SCHEDULE_PERIOD=7890000 # 3 months in seconds, the duration of schedule periods.
SCHEDULE_START_TIME= # Time when rewards start being distributed, stream must be created before this time.
AURORA_TOKEN= # Aurora token address.
```
- Review and edit stream parameters in ./scripts/proposeStream.js
```bash
STREAM_TOKEN_DECIMALS = # Token decimals of STREAM_TOKEN_ADDRESS.
STREAM_TOKEN_ADDRESS = # Ecosystem token being streamed.
STREAM_AURORA_AMOUNT = # Rewards for the stream owner (ecosystem project).
STREAM_OWNER = # Stream owner address which will be able to deposit STREAM_TOKEN_ADDRESS tokens to create the stream.
scheduleRewards = # STREAM_TOKEN_ADDRESS token rewards distribution schedule.
MAX_DEPOSIT_AMOUNT = # Maximum amount of STREAM_TOKEN_ADDRESS tokens allowed for streaming.
MIN_DEPOSIT_AMOUNT = # Minimum amount of STREAM_TOKEN_ADDRESS tokens allowed for streaming. Usually MAX_DEPOSIT_AMOUNT / 2.
```
Warning: Stream proposals must be created very carefully to avoid unused streams in the staking contract storage.
- Execute the script.
```bash
yarn proposeStream:auroraMainnet
```

## Viewing all streams
```bash
yarn viewStream:auroraMainnet
```

## Creating streams (ecosystem projects)

Only stream owners (ecosystem projects) can create streams which have been proposed by depositing tokens.
- Provide PRIVATE_KEY environment variable:
```bash
#.env file
PRIVATE_KEY= # The stream owner private key controlling the STREAM_OWNER address used during stream proposal.
```

- Review and edit stream parameters in ./scripts/createStream.js
```bash
STREAM_TOKEN_AMOUNT = # Total amount of tokens distributed per the schedule. Must match the amount registered in the proposal.
STREAM_TOKEN_ADDRESS = # Ecosystem token being streamed.
STREAM_TOKEN_DECIMALS = # Token decimals of STREAM_TOKEN_ADDRESS.
STREAM_ID = # The id of the stream defined by the stream proposal.
```

- Fund the stream owner address (PRIVATE_KEY) with STREAM_TOKEN_AMOUNT or tokens to be transferred to the stream.

- Execute the script.
```bash
yarn createStream:auroraMainnet
```
or use the pre-filled values after careful review:
```bash
yarn createStreamPLY:auroraMainnet
yarn createStreamTRI:auroraMainnet
yarn createStreamBSTN:auroraMainnet
```

## Verifying contracts

Proxy contracts were already automatically verified because of the automatic bytecode matching in [Aurora Blockscout](https://explorer.aurora.dev/), however to verify the implementation contracts, you have to use the `hardhat verify` as follows:

- Verify `JetStakingV1` implementation contract @ `0x852F139Dd31D2cdc669470880700037Cb3790934`:
```bash
npx hardhat verify --network aurora --contract contracts/JetStakingV1.sol:JetStakingV1 0x852F139Dd31D2cdc669470880700037Cb3790934
```

- Verify `Treasury` implementation contract @ `0x4C101A39ca2D3095DB2507dAdDE736B8E6ed827a`

```bash
npx hardhat verify --network aurora --contract contracts/Treasury.sol:Treasury 0x4C101A39ca2D3095DB2507dAdDE736B8E6ed827a
```

**Treasury**

  - Proxy @ https://aurorascan.dev/address/0xF075c896CbbB625E7911E284cD23EE19bdCCf299#code
  - Implementation @ https://aurorascan.dev/address/0x4C101A39ca2D3095DB2507dAdDE736B8E6ed827a#code
 
**JetStakingV1**
  - Proxy @ https://aurorascan.dev/address/0xccc2b1ad21666a5847a804a73a41f904c4a4a0ec#code
  - Implementation @ https://aurorascan.dev/address/0x852F139Dd31D2cdc669470880700037Cb3790934#code
 
