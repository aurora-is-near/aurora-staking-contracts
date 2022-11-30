# AURORA Staking Contracts

## Table of content
- [Overview](#overview)
- [Governance](#governance)
- [Stream Life Cycle](#stream-life-cycle)
- [Staking and Unstaking](#staking-and-unstaking)
- [Shares and Rewards Calculation](#shares-and-reward-calculation)
- [Treasury](#treasury)
- [Code Documentation](#code-documentation)
- [References](#references)


## Overview

The staking contracts have two core contracts:

![staking-overview](./imgs/staking-overview.drawio.png)
- `Treasury contract`: which holds all the treasury funds, AURORA rewards, and other streams rewards.
- `Staking contract`: which implements the staking/unstaking mechanics, airdroping users, claiming stream rewards, and the stream lifecycle management.

Both contracts inherit the `adminControlled` contract that holds the access control logic.

## Governance

The target of the governance model is to support most of the expected scenarios for managing the development life cycle of the staking contracts in the future as much as possible and to optimize the process towards speed and agility.

In our governance model, some admin keys are managed by DAO with a higher privileges and others have limited privileges for specific tasks such as `AIRDROP_ROLE` admin keys. The `adminControlled` contract inherits the basic RBAC OpenZeppelin model.

Each admin key(s) is/are assigned to a specific role. The following table lists all the roles and the privileges:

| Role                  | Description           | Scope  |
| ---------------------- |:---------------------------------------:| ----------------------:|
| DEFAULT_ADMIN_ROLE      | only used by DAO with the highest privilege | ALL |
| PAUSE_ROLE      | can be used by AURORA team to pause the contract in case of risking AURORA funds or independent trusted watchdogs too.      |   PAUSE |
| AIRDROP_ROLE | only used by third-party service for airdroping users      |    AIRDROP |
| STREAM_MANAGER_ROLE | only used to manage the reward streams      |    STREAMS |
| CLAIM_ROLE | only used to claim rewards on behalf of another/other user(s)      |    CLAIM |
| TREASURY_MANAGER_ROLE | only used to manage the treasury supported reward tokens      |    TREASURY |

The `AdminControlled` contract inherits the `UUPSUpgradeable` proxy contract and only `DEFAULT_ADMIN_ROLE` has the right to upgrade the contract.

## Stream Life Cycle

There are four phases in the stream life cycle:

### *Stream Proposal*

An admin of the staking contract can whitelist a stream. Whitelisting of the stream provides the option for the stream creator (presumably the issuing party of a specific token) to deposit some ERC-20 tokens on the staking contract and potentially get in return some AURORA tokens. Deposited ERC-20 tokens will be distributed to the stakers over some period of time. Here are the parameters of the whitelisting method:

- Amount of the AURORA deposited by the Admin. AURORA should be transferred through transferFrom method of the AURORA ERC-20
- Stream creator address – only this account would be able to create a stream
- Rewards token address – the address of the ERC-20 tokens to be deposited in the stream
- The upper amount of the tokens, that should be deposited by the stream creator. In case the creator deposits less than the specified amount, the amount of released AURORA is decreased proportionally. All the rest of AURORA is transferred back to the admin.
- Max block height, until which the option to create the stream is active. This is implicitly calculated using the start of the schedule times.
- Rewards schedule, specified as an array of tuples (block height, amount of reward tokens that is kept on the staking contract at this block height). This array specifies the piecewise-linear dependency of the decay of the reward in the stream.

Note: the release of AURORA tokens to the stream creator is subjected to the same schedule as rewards. Thus if for a specific moment in time 30% of the rewards are distributed, then it means that 30% of the AURORA deposit can be withdrawn by the stream creator too.

Important: the allowed mechanics of the streams might be useful for two use cases.

First, the investment from either the community treasury or the Aurora DAO directly. One of the KPIs of the project that has received the investment might be the deposit of the specified amount of project tokens to the staking contract once the tokens are issued / released.

Second, staking contract implements the native way of doing an airdrop to the Aurora community. Any project that would like to do an airdrop now is able to use the staking contract.

### *Proposal Cancellation*
Proposal can be cancelled, if the stream creator (owner) didn't create the stream before the start of the reward schedule.

### *Stream Creation*

This method is called by the stream creator (only once) and it realizes the option that was set up during the whitelisting phase.

### *Stream Removal*

This method can be called only by the admin and cancels the reward allocations of the stream to the staking users and the distribution of the AURORA to stream creator. This is a blacklisting functionality that is intended to be used only in emergency situations. The remainder of the rewards tokens and AURORA should be able to be transferred by the admin to any Aurora account.


## Staking and Unstaking

### Staking
Users should be able to stake AURORA (deposit AURORA to the contract for some period of time). During staking, the user gets stream rewards. The user staked AURORA, a weighting coefficient is applied to the streams rewards. All the streams have the same weighting function (except the default AURORA stream which is special case). The default weighting function for the default AURORA stream is `1`.

The weighting function of other streams follows the following curve:

![weighting-function](imgs/weighting-function.png)


It is a decreasing function which creates leverage for the early stakers. It starts with `maxWeight` 1024 for a month, then decays with a negative downward slope till it reachs the end of the 4rth year (end of the schedule) in the reward schedule, after that it goes with a flat weight or `minWeight` 256. 

### Unstaking
The user is able to unstake AURORA at any time, however in such a case, the weighting coefficient is reapplied to the stream rewards for the whole AURORA stake. Also it is important to note that users `MUST` claim their rewards before unstaking their AURORA tokens.

Rewards are calculated based on the schedule function. The schedule function computes the amount of reward token/AURORA released through the stream to all users. More details will be followed inthe next section. An example of a schedule function is shown below:

![schedule function](imgs/scheduleRewards.png)

### Claiming Reward
A user should be able to claim rewards. The rewards may be generated by different streams (see next), so a user should specify the stream that he claims.

Claiming transfers stream rewards in pending release stage for a (`tau` period). The duration of release time (`tau`) is configurable by the admin of the contract and might be different for different streams. After this time lapses, the claimed rewards can be withdrawn.

## Shares and reward calculation

**There are two types of streams:**

- **Default Aurora stream**: It is a special stream which compounds and cannot be claimed. There is no exchange of stream tokens for AURORA by the stream owner.
- **Reward token streams**: These streams give an incentive for ecosystem projects to give some token rewards to the AURORA community and in return they get AURORA tokens in the same proportion and with the same release schedule. There can be multiple streams for the same reward token address. The reward token stream is controlled by both parties:
   - stream manager: Manages the stream lifecycle and it is controlled by the AURORA DAO itself.
   - stream owner: controlled by the reward token owner (e.g TRI, PLY, USN, etc). It is used to create the stream and receive stream owner claimed aurora rewards. 


That's why we have two type of shares:

- **totalAuroraShares**: which represent the total number of AURORA shares for the AURORA stream
- **totalStreamShares**: which represent the total number of shares for other streams (except aurora stream). These shares are weighted by a weighted function.

How the shares are calculated:

- **Staking**
**Aurora shares calculation:**

```javascript=
// use case #1
// The shares are initializes with the amount of the 1st staker
if(totalAuroraShares == 0) {
    _amountOfShares = amount;
} 
// use case #2
// The user shares is calculated as follows
else 
{
    _amountOfShares = 
        (amount * totalAuroraShares) /     
        totalAmountOfStakedAurora
    // Check whether rounding up is needed (result * denominator < numerator).
    if (_amountOfShares * totalAmountOfStakedAurora < numerator) {
        // Round up so users don't get less sharesValue than their staked amount
        _amountOfShares += 1;
}

// update the total aurora shares
// and the total amount of staked aurora
totalAuroraShares += _amountOfShares;
totalAmountOfStakedAurora += amount;
```

**Stream shares calculation:**

```javascript=
// it is mainly relying on two parameters
// the user's aurora shares and the current
// timestamp. The weighting function is 
// applied on these parameters to calculate 
// the stream shares. The weighting function is the 
// the same for all the streams.
    totalStreamShares = 
        weightedShares(
            _amountOfShares,
            block.timestamp
    );
```


- **Unstaking**

If the user unstakes all of his shares, then the number of user shares will be set to zero. However, if a user made a partial unstake, then the total stake value is calculated, the target amount is unstaked and the remaining amount is restaked.

**Calculating the rewards:**

- AURORA and token stream rewards are released gradually per the schedule. Every time that users interract with the contract, the `_before` function is called to release rewards before the user claimes, stakes or unstakes. The timestamp is recorded by `touchedAt` so that rewards to be released are calculated since the last update.

- AURORA rewards get added the the pool of total staked AURORA for compounding.

- Ecosystem streams can be claimed. We record the `stream.rps` (reward per share) every time rewards are released to the current shares.

- The value of the `user.rpsDuringLastClaim` is updated every time that user claims rewards, stakes or unstakes to equal the current `stream.rps`. Users will be able to claim rewards distributed since `rpsDuringLastClaim` based on the number of stream shares owned.

- Gas limitations don't allow claiming rewards for all streams at the time of stake or unstake. So it must be done before in a separate transaction (handled in the UI). When staking or unstaking, any unclaimed rewards are lost because the user's stream rps is set to the current rps without moving rewards to pending (claiming).

1. **Computing the rewards in AURORA stream:**

The rewards are accumulated over time and added to the `totalAmountOfStakedAurora`:

The following steps in `getRewardsAmount()` function are applied to all the streams including the default aurora stream:


```javascript=
// Calculate the startIndex and endIndex.
// Before a user stakes we need to update the totalAmountOfStakedAurora 
// including the new rewards released since the last update (according to schedule).
// The startIndex represents the schedule index in which touchedAt is located.
// The endIndex represents the schedule index in which the current timestamp is located.
start = touchedAt;
end = block.timestamp
(startIndex, endIndex) = getStartEndIndex(start, end)
```
Using the `startIndex` and `endIndex`, the scheduled reward can be calculated as follow:

```javascript=
// 1. calculate scheduled reward if startIndex == endIndex
// start and end are within the same schedule period

reward = scheduleReward[startIndex] - scheduleReward[startIndex + 1];

rewardScheduledAmount = (reward * (end - start)) /
(scheduleTime[startIndex + 1] - scheduleTime[startIndex]);

// 2. if start and end are not within the same schedule period
//     2.1 calculate Reward during the startIndex period
rewardScheduledAmount = 
    (reward * (scheduleTime[startIndex + 1] - start)) /
(scheduleTime[startIndex + 1] - scheduleTime[startIndex]);
//     2.2 calculate reward during the period from startIndex + 1  to endIndex - 1
rewardScheduledAmount += scheduleReward[startIndex + 1] - scheduleReward[endIndex];
//    2.3 calculate reward during the endIndex period
rewardScheduledAmount += (reward * (end - scheduleTime[endIndex])) /
    (scheduleTime[endIndex + 1] - scheduleTime[endIndex]);
```

The following step is not applied to other streams:

```javascript=
totalAmountOfStakedAurora += rewardScheduledAmount;
```

Whenever a user wants to get his AURORA shares reward value (prior unstaking), then the following formula is applied:

```javascript=
userAuroraStakeValue = (totalAmountOfStakedAurora * user.auroraShares) 
                        / totalAuroraShares;
```

2. **Computing the reward per share for each stream:**


Every time a user stakes/unstakes, the `stream.rps` is accumlated using the following formula:

```javascript=
stream.rps += getRewardsAmount(streamId, touchedAt) /
            totalStreamShares;
```

If a user wants to stake/unstake, he has to claim all the stream rewards first (move them to pending withdrawal) in order to reset the `user.rps` to the current `stream.rps`.

Therefore, the user's claimable stream reward at the current timestamp is represented by the rps difference between user's rps and stream's rps. In other words the integration of the stream schedule rewards over the schedule time since the user last claimed and the current stream reward per share).

```bash=
userStreamRewardsToClaim = (
        (stream.rps - user.rpsDuringLastClaim) *
        user.streamShares
    )
```

## Treasury

The treasury contract is used to manage the treasury funds. It should support:

- Only allow treasury managers to approve suppoted streams tokens addresses.
- Exposes the reward payments (controlled by staking contract).

## Code Documentation

Before you read the contracts, you should be aware about the following keywords:

### User Data:

- Deposit: the amount of user's deposited AURORA in the staking contract
- RPS : reward per share during the previous withdrawal
- Pendings: amount of tokens avaialble after a `tau` period from the stream > 0
- AuroraShares: user's AURORA shares
- StreamShares: user's other stream shares
- releaseTimes: the release moment for the pending tokens


### Stream Data
- Owner: the stream owner
- reward token: the stream reward token (e.g TRI)
- Aurora Deposit Amount: Amount of the AURORA deposited by the Admin. AURORA should be transferred through transferFrom method of the AURORA ERC-20
- Aurora Claimed Amount: the claimed aurora amount by the stream owner
- Reward Deposit Amount: the reward stream token deposit amount 
- reward Claimed Amount: the amount of the claimed reward stream to users
- max Deposit Amount: the max deposit of the AURORA by the admin
- Last Time Owner Claimed: last time reward claimed by the stream owner
- tau: the release period for the stream
- rps: Reward per share for a stream j>0
- schedule: an array of times and rewards schedule for a stream
- isProposed: is stream proposed flag
- isActive: is stream created flag

The full code documentation can be found [here](contracts/index.html). It can be only accessed on the localhost.


## References
- [AURORA staking and the community treasury](https://forum.aurora.dev/t/aurora-staking-and-the-community-treasury/75)
- [AURORA staking V2 mechanics](https://forum.aurora.dev/t/aurora-staking-v2/243)
- [AURORA staking: setting-up-the-aurora-staking](https://forum.aurora.dev/t/setting-up-the-aurora-staking/254)
