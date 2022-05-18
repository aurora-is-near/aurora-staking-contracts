const hre = require("hardhat");

async function main() {
  const {
    SCHEDULE_PERIOD,
    TAU_PER_STREAM,
    SCHEDULE_START_TIME,
    AURORA_TOKEN,
  } = process.env
  const STREAM_AURORA_AMOUNT = hre.ethers.utils.parseUnits("0", 18) // zero arora reward for the USN stream
  // const auroraAddress = AURORA_TOKEN ? AURORA_TOKEN : (await hre.ethers.getContract("Token")).address
  const startTime = SCHEDULE_START_TIME ? parseInt(SCHEDULE_START_TIME) : Math.floor(Date.now()/ 1000) + 60
  const STREAM_TOKEN_ADDRESS = "0x5183e1b1091804bc2602586919e6880ac1cf2896"
  const STREAM_TOKEN_DECIMALS = 18
  const STREAM_OWNER = "0x290FF2b6Ea23F9c8D18F63449Cc38F8dDa02CE6d"
  const scheduleTimes = [
    startTime,
    startTime + parseInt(SCHEDULE_PERIOD)
  ]
  const scheduleRewards = [
    hre.ethers.utils.parseUnits("1800000", STREAM_TOKEN_DECIMALS), // 100%
    // Last amount should be 0 so scheduleTimes[4] marks the end of the stream schedule.
    hre.ethers.utils.parseUnits("0", STREAM_TOKEN_DECIMALS), // 0M
  ]

  const MAX_DEPOSIT_AMOUNT = scheduleRewards[0]
  const MIN_DEPOSIT_AMOUNT = scheduleRewards[0].div(2) // or something less

  const [ streamManager ] = await hre.ethers.getSigners()

  const jetStakingV1 = await hre.ethers.getContract("JetStakingV1")
  const streamManagerRole = await jetStakingV1.STREAM_MANAGER_ROLE()
  if(!await jetStakingV1.hasRole(streamManagerRole, streamManager.address)) {
    throw new Error(`Signer '${streamManager.address}' doesn't have STREAM_MANAGER_ROLE`)
  }

  // ^^^^^ TODO: Edit above parameters ^^^^^
  // =======================================

  // FOR this stream we don't have approval for AURORA rewards

  // const auroraToken = new hre.ethers.Contract(
  //   auroraAddress,
  //   ["function approve(address spender, uint value)"],
  //   streamManager
  // )
  // const approvalTx = await auroraToken.approve(jetStakingV1.address, STREAM_AURORA_AMOUNT)
  // console.log("Approving AURORA: ", approvalTx.hash)
  // await approvalTx.wait()

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
