# Integration guide

## ABI

```js
const abi = [
    "function getStreamClaimableAmount(uint streamId, address account) view returns (uint)",
    "function moveRewardsToPending(uint streamId)",
    "function moveAllRewardsToPending()",
    "function withdraw(uint streamId)",
    "function withdrawAll()",
    "function stake(uint amount)",
    "function unstake(uint amount)",
    "function unstakeAll()",
    "function getUserShares(address account) view returns (uint)",
    "function getTotalAmountOfStakedAurora() view returns (uint)",
    "function getAmountOfShares(uint streamId, address account) view returns (uint)",
    "function totalAuroraShares() view returns (uint)",
    "function getUserTotalDeposit(address account) view returns (uint)"
    "function getStreamSchedule(uint streamId) view returns (uint[] scheduleTimes, uint[] scheduleRewards)",
    "function getPending(uint streamId, address account) external view returns (uint)",
    "function getReleaseTime(uint streamId, address account) view returns (uint)",
    "function getStreamOwnerClaimableAmount(uint streamId) view returns (uint)",
    "function releaseAuroraRewardsToStreamOwner(uint streamId)",
]

const staking = new ethers.Contract(
    "0xccc2b1aD21666A5847A804a73a41F904C4a4A0Ec",
    abi,
    provider
)
```

[https://github.com/aurora-is-near/aurora-staking-contracts/blob/main/deployments/auroraMainnet/JetStakingV1.json](https://github.com/aurora-is-near/aurora-staking-contracts/blob/main/deployments/auroraMainnet/JetStakingV1.json)

## StreamId
- AURORA (0x8bec47865ade3b172a928df8f990bc7f2a3b9f79): 0
- PLY (0x09C9D464b58d96837f8d8b6f4d9fE4aD408d3A4f): 1
- TRI (0xFa94348467f64D5A457F75F8bc40495D33c65aBB): 2
- BSTN (0x9f1f933c660a1dc856f0e0fe058435879c5ccef0): 3
- USN (0x5183e1b1091804bc2602586919e6880ac1cf2896): 4
- VOTE (0x6edE987A51d7b4d3945E7a76Af59Ff2b968910A8): 5

View streams status:
```bash
yarn viewStream:auroraMainnet
```

## Claimable ecosystem stream rewards

```js
const amount = await staking.getStreamClaimableAmount(streamId, account)
```

## Claim ecosystem stream rewards

```js
// Claim a single stream by id.
await staking.moveRewardsToPending(streamId)
// Claim all streams.
await staking.moveAllRewardsToPending()
```

## Stake / unstake / unstakeAll

WARNING: before adding more stake or unstaking, the user must have claimed ecosystem stream rewards otherwise the rewards will be lost.

The dust amount of rewards generated between the claim and the stake, unstake, or unstakeAll actions is lost.

```js
// Before calling `stake`, the user must approve the staking contract to transfer AURORA tokens (ERC-20 standard).
await staking.stake(amount)
// Partially unstaking re-stakes the remaining amount with the current stream shares weight (stream shares boost is lost for the re-staked amount).
await staking.unstake(amount)
await staking.unstakeAll()
```

## AURORA rewards
AURORA rewards (streamId = 0) are added to the total staked AURORA (compounded) meaning the user's share value increases.

Estimated AURORA rewards calculation:
```js
const totalStaked = await staking.getTotalAmountOfStakedAurora()
const userShares = await staking.getAmountOfShares(0, account)
const totalShares = await staking.totalAuroraShares()

const userSharesValue = totalStaked.mul(userShares)).div(totalShares)

const userDeposit = await staking.getUserTotalDeposit(account)

const userAuroraRewards = userSharesValue - userDeposit
```

## Withdrawable ecosystem stream rewards
After claiming rewards there is a cool down period to wait before rewards can be withdrawn.

Claiming a stream before rewards have been withdrawn re-sets the cool down period for the cumulated amount.

The cool down period can be different for every stream.

```js
const pendingAmount = await staking.getPending(streamId, account)
const releaseTime = await staking.getReleaseTime(streamId, account)
```


## Withdraw ecosystem stream rewards

```js
// Withdraw a single stream by id.
await staking.withdraw(streamId)
// Withdraw all stream rewards.
await staking.withdrawAll()
```

## APR (Annual Percentage Rate) calculation
These are examples, for efficiency it is recommended to refactor and query on-chain stream information async.

Stream Schedule:
```js
const streamSchedule = await staking.getStreamSchedule(streamId)
```

One day rewards:
```js
const getOneDayReward = (streamId) => {
    const streamSchedule = await staking.getStreamSchedule(streamId)
    const now = Math.floor(Date.now() / 1000)
    const oneDay = 86400
    const streamStart = schedule[0][0].toNumber()
    const streamEnd = schedule[0][schedule[0].length - 1].toNumber()
    if (now <= streamStart) return ethers.BigNumber.from(0) // didn't start
    if (now >= streamEnd - oneDay) return ethers.BigNumber.from(0) // ended
    const currentIndex = schedule[0].findIndex(indexTime => now < indexTime) - 1
    const indexDuration = schedule[0][currentIndex + 1] - schedule[0][currentIndex]
    const indexRewards = schedule[1][currentIndex].sub(schedule[1][currentIndex + 1])
    const oneDayReward = indexRewards.mul(oneDay).div(indexDuration)
    return oneDayReward
}
```

APR calculation:
```js
    const oneDayReward = await getOneDayReward(streamId)
    const totalStaked = await staking.getTotalAmountOfStakedAurora()

    // streamTokenPrice can be queried from coingecko.
    const totalStakedValue = Number(ethers.utils.formatUnits(totalStaked, 18)) * streamTokenPrice
    const oneYearStreamRewardValue = Number(ethers.utils.formatUnits(oneDayReward, 18)) * 365 * streamTokenPrice
    const streamAPR = oneYearStreamRewardValue * 100 / totalStakedValue
    const totalAPR = allStreamsCumulatedOneYearRewardValue * 100 / totalStakedValue
```
