const { upgradeProxy } = require('./helpers')

async function main() {
  await upgradeProxy('Treasury')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
