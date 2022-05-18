const hre = require("hardhat");

async function main() {
  const jetStakingV1 = await hre.ethers.getContract("JetStakingV1")
  const count = (await jetStakingV1.getStreamsCount()).toNumber()
  const streams = await Promise.all([...Array(count).keys()].map(id => jetStakingV1.getStream(id)))
  const streamSchedules = await Promise.all([...Array(count).keys()].map(id => jetStakingV1.getStreamSchedule(id)))
  streams.forEach((stream, id) => {
    console.log("Stream ID:", id)
    console.log("------------")
    console.log("streamOwner: ", stream.streamOwner)
    console.log("rewardToken: ", stream.rewardToken)
    console.log("auroraDepositAmount: ", stream.auroraDepositAmount.toString(), `(${stream.auroraDepositAmount.toHexString()})`)
    console.log("auroraClaimedAmount: ", stream.auroraClaimedAmount.toString(), `(${stream.auroraClaimedAmount.toHexString()})`)
    console.log("rewardDepositAmount: ", stream.rewardDepositAmount.toString(), `(${stream.rewardDepositAmount.toHexString()})`)
    console.log("rewardClaimedAmount: ", stream.rewardClaimedAmount.toString(), `(${stream.rewardClaimedAmount.toHexString()})`)
    console.log("maxDepositAmount: ", stream.maxDepositAmount.toString(), `(${stream.maxDepositAmount.toHexString()})`)
    console.log("lastTimeOwnerClaimed: ", stream.lastTimeOwnerClaimed.toString(), `(${new Date(stream.lastTimeOwnerClaimed * 1000).toUTCString()})`)
    console.log("rps: ", stream.rps.toString(), `(${stream.rps.toHexString()})`)
    console.log("tau: ", stream.tau.toNumber())
    console.log("status: ", stream.status)
    console.log("scheduleTimes: ", JSON.stringify(streamSchedules[id].scheduleTimes.map(time => new Date(time * 1000).toUTCString())))
    console.log("scheduleRewards: ", JSON.stringify(streamSchedules[id].scheduleRewards.map(amount => amount.toString())))
    console.log("")
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
