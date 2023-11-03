const { ethers } = require("hardhat")

const {
  SUB_PROXY_ADDRESS,
} = process.env

async function main() {
  if (!SUB_PROXY_ADDRESS) {
    throw new Error('SUB_PROXY_ADDRESS is not set')
  }
  const contractFactory = await ethers.getContractFactory('SphereXProtectedSubProxy');
  const contract = await contractFactory.attach(subProxyAddress);

  console.log('sphereXAdmin', await contract.sphereXAdmin())

  // const result = contract.transferSphereXAdminRole('0x1c76dF114F0113e947d116D8cC2A9202921A2DE0')

  // const result = contract.acceptSphereXAdminRole()

  // console.log('result', result)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
