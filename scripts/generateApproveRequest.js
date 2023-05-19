const hre = require("hardhat");

async function main() {
  const stakingContractAddress = '0xccc2b1aD21666A5847A804a73a41F904C4a4A0Ec';
  const amount = hre.ethers.utils.parseUnits("25000000", 18); // 25M
  const iface = new ethers.utils.Interface([
    "function approve(address spender, uint value)"
  ])
  const encoded = iface.encodeFunctionData(
    "approve",
    [stakingContractAddress, amount]
  )

  console.log(`Hex data for approval request: ${encoded}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
