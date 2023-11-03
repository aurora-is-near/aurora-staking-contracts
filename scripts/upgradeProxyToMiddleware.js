const { ethers, upgrades } = require("hardhat");
const { upgradeProxyToMiddleware } = require("./middleware_utils");

const {
  JET_STAKING_PROXY_ADDRESS,
  TREASURY_PROXY_ADDRESS,
} = process.env

async function upgradeProxy(address, factory) {
    const {owner} = await getNamedAccounts();
    const contractFactory = await ethers.getContractFactory(factory);
    const contract = await ethers.getContractAt(factory, address)

    const result = await upgradeProxyToMiddleware(contract, contractFactory);
    console.log('result', result)
}

async function main() {
    await upgradeProxy(TREASURY_PROXY_ADDRESS, 'Treasury')

    await upgradeProxy(JET_STAKING_PROXY_ADDRESS, 'JetStakingV3')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
