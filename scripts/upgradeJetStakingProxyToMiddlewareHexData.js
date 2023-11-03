const { upgradeProxy } = require('./helpers')

async function main() {
  await upgradeProxy('JetStakingV3')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
