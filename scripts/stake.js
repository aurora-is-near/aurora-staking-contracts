const ERC20Factory = require('@openzeppelin/contracts/build/contracts/ERC20.json')

const {
  AURORA_TOKEN,
  JET_STAKING_PROXY_ADDRESS,
} = process.env

async function main() {
  const [owner] = await ethers.getSigners()

  const auroraToken = await ethers.getContractFactory(ERC20Factory.abi, ERC20Factory.bytecode)
  const auroraTokenContract = await auroraToken.attach(AURORA_TOKEN)
  const auroraTokenDecimals = await auroraTokenContract.decimals()

  // const jetStakingFactory = await ethers.getContractFactory("JetStakingV3")
  // const jetStaking = await jetStakingFactory.attach(JET_STAKING_PROXY_ADDRESS)

  const jetStaking = await hre.ethers.getContract("JetStakingV3")

  const allowance = await auroraTokenContract.allowance(owner.address, jetStaking.address)
  const amountToSend = ethers.utils.parseUnits('1000', auroraTokenDecimals)

  // console.log('jetstaking', jetStaking)

  console.log('jetStaking address', jetStaking.address)

  if (allowance.lt(amountToSend)) {
    await auroraTokenContract.approve(jetStaking.address, amountToSend)
  }

  const result = await jetStaking.stake(amountToSend)

  console.log('result', result)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
