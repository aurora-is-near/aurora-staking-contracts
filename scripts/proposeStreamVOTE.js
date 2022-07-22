const hre = require("hardhat");

async function main() {
  const {
    TAU_PER_STREAM,
    SCHEDULE_START_TIME,
  } = process.env
  const STREAM_AURORA_AMOUNT = hre.ethers.utils.parseUnits("0", 18) // zero arora reward for the VOTE stream
  const startTime = SCHEDULE_START_TIME ? parseInt(SCHEDULE_START_TIME) : Math.floor(Date.now()/ 1000) + 60
  const STREAM_TOKEN_ADDRESS = "0x6edE987A51d7b4d3945E7a76Af59Ff2b968910A8" // update me
  const STREAM_TOKEN_DECIMALS = 18
  const STREAM_OWNER = "0x61c8f8f192C345424a0836d722892231CE7a47b8" // update me
  const endOf2023Timestamp = 1704067200
  const scheduleTimes = [
    startTime,
    endOf2023Timestamp
  ]
  const scheduleRewards = [ // update me
    hre.ethers.utils.parseUnits("1000000000", STREAM_TOKEN_DECIMALS), // 100% (1B)
    hre.ethers.utils.parseUnits("0", STREAM_TOKEN_DECIMALS), // 0%
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
  console.log(
    `aurora token: `,
    await jetStakingV1.auroraToken()
  )
  console.log(
    `treasury contract address`,
    await jetStakingV1.treasury()
  )
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
