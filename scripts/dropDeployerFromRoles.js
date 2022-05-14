const hre = require("hardhat");

async function main() {
    const jetStakingV1 = await hre.ethers.getContract("JetStakingV1")
    const treasury = await hre.ethers.getContract("Treasury")
    // Revoke deployer roles.
    // ======================

    // treasury
    // drop deployer address from the treasury manager role in the treasury contract
    if(await treasury.hasRole(treasuryManagerRole, deployer.address)) {
        await treasury.connect(deployer).revokeRole(treasuryManagerRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${treasuryManagerRole} role in treasury contract`,
        '... Dropped?',
        await treasury.hasRole(treasuryManagerRole, deployer.address) ? false: true
    )

    // drop deployer address from the pause role role in the treasury contract
    if(await treasury.hasRole(pauseRole, deployer.address)) {
        await treasury.connect(deployer).revokeRole(pauseRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${pauseRole} role in treasury contract`,
        '... Dropped?',
        await treasury.hasRole(pauseRole, deployer.address) ? false: true
    )
    // drop deployer address from the default admin role in the treasury contract
    if(await treasury.hasRole(treasuryDefaultAdminRole, deployer.address)) {
        await treasury.connect(deployer).revokeRole(treasuryDefaultAdminRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${treasuryDefaultAdminRole} role in treasury contract`,
        '... Dropped?',
        await treasury.hasRole(treasuryDefaultAdminRole, deployer.address) ? false: true
    )

    // jetStaking
    // drop deployer address from the pause role in the jet-staking contract
    if(await jetStakingV1.hasRole(pauseRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(pauseRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${pauseRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(pauseRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the stream manager role in the jet-staking contract
    if(await jetStakingV1.hasRole(streamManagerRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(streamManagerRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${streamManagerRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(streamManagerRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the claim rolein the jet-staking contract
    if(await jetStakingV1.hasRole(claimRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(claimRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${claimRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(claimRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the airdrop role in the jet-staking contract
    if(await jetStakingV1.hasRole(airdropRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(airdropRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${airdropRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(airdropRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the default admin role in the jet-staking contract
    if(await jetStakingV1.hasRole(defaultAdminRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(defaultAdminRole, deployer.address)
        await new Promise(f => setTimeout(f, 1000));
    }
    console.log(
        `Drop deployer address from ${defaultAdminRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(defaultAdminRole, deployer.address) ? false: true
    )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
