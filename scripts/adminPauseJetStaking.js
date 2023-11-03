const {
  JET_STAKING_PROXY_ADDRESS,
} = process.env

async function main() {
  const contractFactory = await ethers.getContractFactory("JetStakingV3")
  const contract = await contractFactory.attach(JET_STAKING_PROXY_ADDRESS)
  const result = await contract.adminPause(0)

  console.log('result', result)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
