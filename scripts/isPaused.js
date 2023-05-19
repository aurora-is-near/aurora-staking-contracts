const hre = require("hardhat");

async function main() {
    const [ caller ] = await hre.ethers.getSigners()
    const jetStaking = new hre.ethers.Contract(
        '0xccc2b1aD21666A5847A804a73a41F904C4a4A0Ec', // replace me
        ["function paused() view returns(uint256)"],
        caller
    )
  console.log(`Paused Flag status: ${await jetStaking.paused()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
