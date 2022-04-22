# Deployment 

Before calling `yarn deploy:NETWORK`. The deployer should follow the steps below.

### Configurateion

Update the environment variables:

```bash
cp .env.example .env
```

Update the `.env` file:

```bash
INFURA_KEY= # only needed in case of 
ETHERSCAN_API_KEY= # Mainly is required in case of verifying the contracts on Etherscan
PRIVATE_KEY= # the private key will be used as a deployer address 
MNEMONIC= # This is an alternative for the private key (the deployer address is the first address)
TESTING=true # set this flag to false in case of production deployment
AURORA_TOKEN= # Aurora token address (not needed in case of testing)
FLAGS=0 # pause flag 
ONE_YEAR=31556926 # one year in seconds
TAU_PER_STREAM=2629746 # 1 month in seconds
MIN_WEIGHT=256 # min weighting factor for streams
MAX_WEIGHT=1024 # max weighting factor for streams
AURORA_STREAM_OWNER= # AURORA stream owner (default first account)
SCHEDULE_START_TIME= # schedule start time
```

### Deploy

TBD