const hre = require("hardhat");

async function main() {
  const jetStakingV1 = await hre.ethers.getContract("JetStakingV1")
  const count = (await jetStakingV1.getStreamsCount()).toNumber()
  const streams = await Promise.all([...Array(count).keys()].map(id => jetStakingV1.getStream(id)))
  streams.forEach((stream, id) => {
    console.log(`Stream id: ${id}`, stream)
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
