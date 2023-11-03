const { getImplementationAddress } = require('@openzeppelin/upgrades-core')
const { ethers, upgrades } = require("hardhat");

const {
  AURORA_TOKEN,
  JET_STAKING_PROXY_ADDRESS,
  TREASURY_PROXY_ADDRESS,
} = process.env

async function main() {
  if (!JET_STAKING_PROXY_ADDRESS) {
    throw new Error('JET_STAKING_PROXY_ADDRESS is not set')
  }
  const jetStakingFactory = await ethers.getContractFactory("JetStakingV3")
  const jetStaking = await jetStakingFactory.attach(JET_STAKING_PROXY_ADDRESS)

  console.log('jetStaking address', jetStaking.address)
  console.log('jetStaking implementation', await upgrades.erc1967.getImplementationAddress(jetStaking.address))
  try {
    console.log('jetStaking getSubImplementation', await jetStaking.getSubImplementation())
  } catch (e) {
    console.log('jetStaking getSubImplementation error', e)
  }

  console.log('paused: ', await jetStaking.paused())
  console.log('aurora token: ', await jetStaking.auroraToken())
  console.log('minWeight: ', (await jetStaking.minWeight()))
  console.log('maxWeight: ', (await jetStaking.maxWeight()))
  console.log('totalAmountOfStakedAurora: ', (await jetStaking.totalAmountOfStakedAurora()))
  console.log('totalAuroraShares: ', (await jetStaking.totalAuroraShares()))
  console.log('totalStreamShares: ', (await jetStaking.totalStreamShares()))
  console.log('getTotalAmountOfStakedAurora: ', (await jetStaking.getTotalAmountOfStakedAurora()))
  console.log('getTreasuryBalance: ', (await jetStaking.getTreasuryBalance(AURORA_TOKEN)))
  console.log('treasury: ', (await jetStaking.treasury()))
  console.log('getStreamsCount: ', (await jetStaking.getStreamsCount()))
  try {
    console.log('getSubImplementation: ', (await jetStaking.getSubImplementation()))
  } catch (e) {
    console.log('getSubImplementation error', e)
  }

  console.log('-------')

  if (!TREASURY_PROXY_ADDRESS) {
    throw new Error('TREASURY_PROXY_ADDRESS is not set')
  }

  const treasuryFactory = await hre.ethers.getContractFactory("Treasury")
  const treasury = await treasuryFactory.attach(TREASURY_PROXY_ADDRESS)

  console.log('treasury address', treasury.address)
  console.log('treasury implementation', await upgrades.erc1967.getImplementationAddress(treasury.address))
  try {
    console.log('treasury getSubImplementation', await treasury.getSubImplementation())
  } catch (e) {
    console.log('treasury getSubImplementation error', e)
  }

  console.log('isSupportedToken: ', (await treasury.isSupportedToken(AURORA_TOKEN)))
  console.log('paused: ', (await treasury.paused()))
  try {
    console.log('getSubImplementation: ', (await treasury.getSubImplementation()))
  } catch (e) {
    console.log('getSubImplementation error', e)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
