const hre = require("hardhat");

async function main() {
  const streamToken = "0x7a5D955B6526a559C2fB85c322451dB79DcccEC8" // update me
  const [ streamManager ] = await hre.ethers.getSigners()
  const treasury = await hre.ethers.getContract("Treasury")
  const tx = await treasury.connect(streamManager).addSupportedToken(streamToken)
  console.log("Adding supported Token to treasury: ", tx.hash)
  await tx.wait()
  console.log(
    `Token ${streamToken} is supported ?`, 
    await treasury.isSupportedToken(streamToken)
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});