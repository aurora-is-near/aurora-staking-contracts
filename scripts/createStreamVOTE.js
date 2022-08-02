const hre = require("hardhat");

async function main() {
  const STREAM_TOKEN_DECIMALS = 18
  const STREAM_TOKEN_AMOUNT = hre.ethers.utils.parseUnits("1000000000", STREAM_TOKEN_DECIMALS) // update the token amount
  const STREAM_TOKEN_ADDRESS = "0x6edE987A51d7b4d3945E7a76Af59Ff2b968910A8" // update me
  const STREAM_ID = 5 // update me (5 on mainnet)

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
