const hre = require("hardhat");

async function main() {
  const {
    SCHEDULE_PERIOD,
    TAU_PER_STREAM,
    SCHEDULE_START_TIME,
    AURORA_TOKEN,
  } = process.env
  const STREAM_AURORA_AMOUNT = hre.ethers.utils.parseUnits("100", 18)
  const auroraAddress = AURORA_TOKEN ? AURORA_TOKEN : (await hre.ethers.getContract("Token")).address
  const startTime = SCHEDULE_START_TIME ? parseInt(SCHEDULE_START_TIME) : Math.floor(Date.now()/ 1000) + 60
  const STREAM_TOKEN_ADDRESS = ""
  const STREAM_TOKEN_DECIMALS = 18
  const STREAM_OWNER = ""
  const scheduleTimes = [
    startTime,
    startTime + parseInt(SCHEDULE_PERIOD),
    startTime + 2 * parseInt(SCHEDULE_PERIOD),
    startTime + 3 * parseInt(SCHEDULE_PERIOD),
    startTime + 4 * parseInt(SCHEDULE_PERIOD)
  ]
  const scheduleRewards = [
    hre.ethers.utils.parseUnits("6000000", STREAM_TOKEN_DECIMALS),// 900k
    hre.ethers.utils.parseUnits("5100000", STREAM_TOKEN_DECIMALS), // 1.2M
    hre.ethers.utils.parseUnits("3900000", STREAM_TOKEN_DECIMALS), // 1.8M
    hre.ethers.utils.parseUnits("2100000", STREAM_TOKEN_DECIMALS), // 2.1M
    // Last amount should be 0 so scheduleTimes[4] marks the end of the stream schedule.
    hre.ethers.utils.parseUnits("0", STREAM_TOKEN_DECIMALS), // 0M
  ]
  const MAX_DEPOSIT_AMOUNT = scheduleRewards[0]
  const MIN_DEPOSIT_AMOUNT = scheduleRewards[0]

  const [ streamManager ] = await hre.ethers.getSigners()

  const jetStakingV1 = await hre.ethers.getContract("JetStakingV1")
  const streamManagerRole = await jetStakingV1.STREAM_MANAGER_ROLE()
  if(!await jetStakingV1.hasRole(streamManagerRole, streamManager.address)) {
    throw new Error(`Signer '${streamManager.address}' doesn't have STREAM_MANAGER_ROLE`)
  }

  // ^^^^^ TODO: Edit above parameters ^^^^^
  // =======================================

  const auroraToken = new hre.ethers.Contract(
    auroraAddress,
    ["function approve(address spender, uint value)"],
    streamManager
  )
  const approvalTx = await auroraToken.approve(jetStakingV1.address, STREAM_AURORA_AMOUNT)
  console.log("Approving AURORA: ", approvalTx.hash)
  await approvalTx.wait()

  const proposalTx = await jetStakingV1.proposeStream(
    STREAM_OWNER,
    STREAM_TOKEN_ADDRESS,
    STREAM_AURORA_AMOUNT,
    MAX_DEPOSIT_AMOUNT,
    MIN_DEPOSIT_AMOUNT,
    scheduleTimes,
    scheduleRewards,
    parseInt(TAU_PER_STREAM),
  )
  console.log("Proposing stream: ", proposalTx.hash)
  await proposalTx.wait()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
