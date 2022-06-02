const hre = require("hardhat");

async function main() {
  // Execute the transaction directly from MetaMask (advanced setting) with Hex Data:
  // `0x2692c59f0000000000000000000000000000000000000000000000000000000000000001`

  const FLAGS = 1 << 0

  const adminControlled = await hre.ethers.getContract("JetStakingV1")
  // const adminControlled = await hre.ethers.getContract("Treasury")

  const [ admin ] = await hre.ethers.getSigners()
  const pauseRole = await adminControlled.PAUSE_ROLE()
  const defaultAdminRole = await adminControlled.DEFAULT_ADMIN_ROLE()

  if (!(await adminControlled.hasRole(pauseRole, admin.address))) {
    console.log("Only pause role can pause/unpause.")
    return
  }
  const paused = await adminControlled.paused()
  console.log("Current pause flags:", paused.toHexString())
  if (paused.eq(FLAGS)) {
    console.log("Already paused/unpaused")
    return
  }
  if (!paused.and(FLAGS).eq(paused) &&
    !(await adminControlled.hasRole(defaultAdminRole, admin.address))
  ) {
    console.log("Only default admin can unpause.")
    return
  }

  const pauseTx = await adminControlled.adminPause(FLAGS)
  console.log("Tx hash:", pauseTx.hash)
  await pauseTx.wait()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
