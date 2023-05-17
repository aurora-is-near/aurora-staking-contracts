const ethers = require('ethers');
const hre = require("hardhat");

async function main() {
    const totalSupply =  hre.ethers.utils.parseUnits('1000000000', 18);
    const rewardAllocationPercentage = 25; // 5% of the total supply
    const rewardAllocation = totalSupply.mul(rewardAllocationPercentage).div(1000);

    const rewardsPerQuarter = [];
    rewardsPerQuarter.push(rewardAllocation); // First element is the total rewardAllocation
    let currentQuarterReward = rewardAllocation;
    let currentQuarter = 2;

    while (currentQuarter <=17) {
        currentQuarterReward = currentQuarterReward.mul(1e11).div(104427378243); // decreaseCoefficient 1/0.95760328069857364 = 1.04427378243
        rewardsPerQuarter.push(currentQuarterReward);
        currentQuarter++;
    }
    const startTimestamp = 1684359600;
    const scheduleTimes = [];
    const scheduleRewards = [];

    rewardsPerQuarter.forEach((reward, index) => {
        const timestamp = startTimestamp + index * (365 * 24 * 60 * 60 / 4);
        scheduleTimes.push(timestamp);
        scheduleRewards.push(ethers.utils.formatEther(reward));
    });

    console.log('Schedule Times:', scheduleTimes);
    console.log('Schedule Rewards:', scheduleRewards);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});