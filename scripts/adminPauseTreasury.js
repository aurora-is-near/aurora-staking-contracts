const {
  TREASURY_PROXY_ADDRESS,
} = process.env

async function main() {
  const contractFactory = await ethers.getContractFactory("Treasury")
  const contract = await contractFactory.attach(TREASURY_PROXY_ADDRESS)
  const result = await contract.adminPause(0)

  console.log('result', result)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
