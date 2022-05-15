const hre = require("hardhat");

async function main() {
  const STREAM_TOKEN_DECIMALS = 18
  const STREAM_TOKEN_AMOUNT = hre.ethers.utils.parseUnits("", STREAM_TOKEN_DECIMALS)
  const STREAM_TOKEN_ADDRESS = ""
  const STREAM_ID = 0

  // ^^^^^ TODO: Edit above parameters ^^^^^
  // =======================================

  const [ streamOwner ] = await hre.ethers.getSigners()
  const jetStakingV1 = await hre.ethers.getContract("JetStakingV1")

  const streamToken = new hre.ethers.Contract(
    STREAM_TOKEN_ADDRESS,
    ["function approve(address spender, uint value)"],
    streamOwner
  )
  const approvalTx = await streamToken.approve(jetStakingV1.address, STREAM_TOKEN_AMOUNT)
  console.log("Approving Stream Token: ", approvalTx.hash)
  await approvalTx.wait()

  const createTx = await jetStakingV1.createStream(
    STREAM_ID,
    STREAM_TOKEN_AMOUNT
  )
  console.log("Creating stream: ", createTx.hash)
  await createTx.wait()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
