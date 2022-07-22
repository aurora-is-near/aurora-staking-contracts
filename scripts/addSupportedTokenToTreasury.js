const hre = require("hardhat");

async function main() {
  const streamToken = "0x6edE987A51d7b4d3945E7a76Af59Ff2b968910A8" // update me
  const [ treasuryManager ] = await hre.ethers.getSigners() // make sure you are using the private key for
  const treasuryAddress = "0xF075c896CbbB625E7911E284cD23EE19bdCCf299"
  const treasury = new hre.ethers.Contract(
    treasuryAddress,
    ["function addSupportedToken(address _token)"],
    treasuryManager
  )
  const tx = await treasury.addSupportedToken(streamToken)
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