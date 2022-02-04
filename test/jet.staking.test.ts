import { expect, use } from "chai";
import { ethers, network, deployments, upgrades } from "hardhat";
import { Signer } from "ethers"
import exp from "constants";

describe("JetStaking", function () {

    let owner: any
    let user1: Signer, user2: Signer, user3: Signer, user4: Signer, user5: Signer
    let user1Account: any, user2Account: any, user3Account: any, user4Account: any, user5Account: any
    let omg: any, hex: any, sampleTokenContract: any
    let aurora: any
    let jet: any
    let treasury: any
    let startTime: any

    before(async () => {
        // deploys all the contracts
        [owner, user1Account, user2Account, user3Account, user4Account, user5Account] = await ethers.getSigners()
        const supply = ethers.utils.parseUnits("1000000", 18)
        const Token = await ethers.getContractFactory("Token")
        aurora = await Token.connect(owner).deploy(supply, "AuroraToken", "AURORA")
        // random example for other reward token contracts
        user1 = ethers.provider.getSigner(user1Account.address)
        user2 = ethers.provider.getSigner(user2Account.address)
        omg = await Token.connect(user1).deploy(supply, "OMGToken", "OMG")
        hex = await Token.connect(user2).deploy(supply, "HexToken", "HEX")
        sampleTokenContract = await Token.connect(owner).deploy(supply, "SampleToken", "ST")

        const Treasury = await ethers.getContractFactory("Treasury")
        treasury = await upgrades.deployProxy(
            Treasury, 
            [
                [owner.address],
                [
                    aurora.address,
                    omg.address,
                    hex.address
                ]
            ]
        )
        const name = "Jet Staking" 
        const symbol = "VOTE"
        const seasonAmount = 24
        const seasonDuration = 5270400 // 61 days in seconds (two month)
        startTime = Math.floor(Date.now()/ 1000) + 1 // starts after 1 second from now.
        const admin = owner.address
        const flags = 0
        const decayGracePeriod = 86400
        const burnGracePeriod = decayGracePeriod * 55
        const JetStaking = await ethers.getContractFactory('JetStaking')
        jet = await upgrades.deployProxy(
            JetStaking,
            [
                name, 
                symbol,
                seasonAmount,
                seasonDuration,
                startTime,
                aurora.address,
                treasury.address,
                admin,
                flags,
                decayGracePeriod,
                burnGracePeriod
            ]
        )
    })

    beforeEach(async () => {        
        const user1Address = user1Account.address
        const user2Address = user2Account.address
        const user3Address = user3Account.address
        const user4Address = user4Account.address
        const user5Address = user5Account.address

        const user1RewardToken = omg.address
        const user2RewardToken = hex.address

        await deployments.fixture()

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [user1Address]
        })

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [user2Address]
        })

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [user3Address]
        })

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [user4Address]
        })

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [user5Address]
        })

        user1 = ethers.provider.getSigner(user1Address)
        user2 = ethers.provider.getSigner(user2Address)
        user3 = ethers.provider.getSigner(user3Address)
        user4 = ethers.provider.getSigner(user4Address)
        user5 = ethers.provider.getSigner(user5Address)

        await aurora.connect(owner).transfer(user1Address, ethers.utils.parseUnits("10000", 18))
        await aurora.connect(owner).transfer(user2Address, ethers.utils.parseUnits("10000", 18))
        await aurora.connect(owner).transfer(user3Address, ethers.utils.parseUnits("10000", 18))
        await aurora.connect(owner).transfer(user4Address, ethers.utils.parseUnits("10000", 18))
        await aurora.connect(owner).transfer(user5Address, ethers.utils.parseUnits("10000", 18))

        await aurora.connect(owner).approve(jet.address, await aurora.totalSupply())

        await aurora.connect(user1).approve(jet.address, ethers.utils.parseUnits("10000", 18))
        await aurora.connect(user2).approve(jet.address, ethers.utils.parseUnits("10000", 18))
        await aurora.connect(user3).approve(jet.address, ethers.utils.parseUnits("10000", 18))
        await aurora.connect(user4).approve(jet.address, ethers.utils.parseUnits("10000", 18))
        await aurora.connect(user5).approve(jet.address, ethers.utils.parseUnits("10000", 18))

        omg = await ethers.getContractAt("IERC20Upgradeable", user1RewardToken)
        hex = await ethers.getContractAt("IERC20Upgradeable", user2RewardToken)

        await treasury.connect(owner).transferOwnership(jet.address)
        await treasury.connect(owner).approveTokensTo([aurora.address, omg.address, hex.address], jet.address)

        const seasons = [0, 1, 2, 3, 4, 5, 6, 7]
        const rewardWeightValues = [5, 10, 11, 13, 16, 20, 25, 30]
        const voteWeightValues = [0, 10, 11, 13, 16, 20, 25, 30]

        await jet.connect(owner).updateRewardWeight(seasons, rewardWeightValues)
        await jet.connect(owner).updateVoteWeight(seasons, voteWeightValues)
    })

    it("should return treasury account", async () => {
        expect(await jet.treasury()).to.eq(treasury.address)
    })

    it("should return jet staking name", async () => {
        const name = "Jet Staking"
        expect(await jet.name()).to.eq(name)
    })

    it("should return let staking symbol", async () => {
        const symbol = "VOTE"
        expect(await jet.symbol()).to.eq(symbol)
    })

    it("should return jet season amount ", async () => {
        const seasonAmount = 24
        expect(await jet.seasonAmount()).to.eq(seasonAmount)
    })

    it("should return jet season duration", async () => {
        const seasonDuration = 5270400 // 61 days in seconds (two month)
        expect(await jet.seasonDuration()).to.eq(seasonDuration)
    })

    it("should return jet start time", async () => {
        expect(await jet.startTime()).to.eq(startTime)
    })

    it("should return jet decay grace period", async () => {
        const decayGracePeriod = 86400; // 1 day 
        expect(await jet.decayGracePeriod()).to.eq(decayGracePeriod)
    })

    it("should update decay grace period", async () => {
        const newDecayGracePeriod = 96400;
        await jet.updateDecayGracePeriod(newDecayGracePeriod, { from: owner.address })
        expect(await jet.decayGracePeriod()).to.eq(newDecayGracePeriod)
    })

    it("should update season amount", async () => {
        const newSeasonAmount = 48;
        await jet.updateSeasonAmount(newSeasonAmount, { from: owner.address })
        expect(await jet.seasonAmount()).to.eq(newSeasonAmount)
    })

    it("should update treasury", async () => {
        const newTreasury = "0x0a4c79cE84202b03e95B7a692E5D728d83C44c76";
        await jet.updateTreasury(newTreasury, { from: owner.address })
        expect(await jet.treasury()).to.eq(newTreasury)
    })

    it("should update aurora token", async () => {
        const newAuroraToken = "0x0a4c79cE84202b03e95B7a692E5D728d83C44c76";
        await jet.updateAuroraToken(newAuroraToken, { from: owner.address })
        expect(await jet.auroraToken()).to.eq(newAuroraToken)
    })

    it("should update update reward weights", async () => {
        const keys = [0, 1, 2, 3, 4, 5, 6, 7]
        const values = [7, 12, 13, 15, 18, 22, 27, 32]
         
        await jet.updateRewardWeight(keys, values, { from: owner.address })

        for (let i = 0; i < keys.length; i++) {
            expect(await jet.rewardWeights(keys[i])).to.eq(values[i])
        }
    })

    it("should update update vote weights", async () => {
        const keys = [0, 1, 2, 3, 4, 5, 6, 7]
        const values = [2, 12, 13, 15, 18, 22, 27, 32]
         
        await jet.updateVoteWeight(keys, values, { from: owner.address })

        for (let i = 0; i < keys.length; i++) {
            expect(await jet.voteWeights(keys[i])).to.eq(values[i])
        }
    })

    it("should initialize seasons", async () => {
        const seasonNumbers = 24
        const seasonDuration = 5270400 // 61 days in seconds (two month)

        const season0 = await jet.seasons(0)
        const seasonN = await jet.seasons(seasonNumbers - 1)

        //interval between first season starts to last season starts
        const intervalBetweenStarts = seasonN.startSeason.toNumber() - season0.startSeason.toNumber()
        //interval between first season ends to last season ends
        const intervalBetweenEnds = seasonN.endSeason.toNumber() - season0.endSeason.toNumber()

        expect(intervalBetweenStarts / 23).to.eq(seasonDuration + 1)
        expect(intervalBetweenEnds / 23).to.eq(seasonDuration + 1)
    })

    it("should allow to add season", async () => {
        const seasonNumbers = 24
        const seasonDuration = 5270400 // 61 days in seconds (two month)
        const decayGracePeriod = 86400

        const seasonN = await jet.seasons(seasonNumbers - 1)
        const lastSeasonEnds = seasonN.endSeason.toNumber()

        await jet.addSeason(
            lastSeasonEnds + 1,
            lastSeasonEnds + 1,
            lastSeasonEnds + 1 + seasonDuration,
            lastSeasonEnds + 1,
            lastSeasonEnds + 1 + seasonDuration,
            lastSeasonEnds + 1,
            lastSeasonEnds + 1 + seasonDuration,
            lastSeasonEnds + 1 + seasonDuration,
            lastSeasonEnds + 1 + decayGracePeriod
        )
        
        const seasonNew = await jet.seasons(seasonNumbers)
        
        expect(seasonNew.startSeason.toNumber()).to.eq(lastSeasonEnds + 1)
        expect(seasonNew.endSeason.toNumber()).to.eq(lastSeasonEnds + 1 + seasonDuration)
        expect(seasonNew.decayStart.toNumber()).to.eq(lastSeasonEnds + 1 + decayGracePeriod)
    })

    it("should allow to add stream", async () => {

        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        expect((await jet.streams(0)).rewardsToken).to.eq(rewardsToken)
        expect((await jet.streams(0)).tokenOwner).to.eq(tokenOwner)
    })

    it("should allow to remove stream", async () => {

        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 100, 100]

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        const rewardsToken1 = hex.address 
        const tokenOwner1 = await user1.getAddress()
        const auroraAmountTotal1 = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount1 = ethers.utils.parseUnits("3333", 18)
        const heigth1 = (await ethers.provider.getBlock("latest")).timestamp + 20
        const seasonIndexes1 = [0, 1, 2, 3, 4]
        const seasonRewards1 = [4000, 4000, 1500, 300, 200]

        await jet.addStream(
            rewardsToken1,
            tokenOwner1,
            auroraAmountTotal1,
            rewardsTokenAmount1,
            heigth1,
            seasonIndexes1,
            seasonRewards1
        )

        await jet.removeStream(0)

        expect((await jet.streams(0)).rewardsToken).to.eq(rewardsToken1)
        expect((await jet.streams(0)).tokenOwner).to.eq(tokenOwner1)
    })

    it("should allow to remove stream if initialized", async () => {

        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 100, 100]

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        const balanceBeforeDeposit = await omg.balanceOf(await user1.getAddress())

        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        const rewardsToken1 = hex.address 
        const tokenOwner1 = await user1.getAddress()
        const auroraAmountTotal1 = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount1 = ethers.utils.parseUnits("3333", 18)
        const heigth1 = (await ethers.provider.getBlock("latest")).timestamp + 20
        const seasonIndexes1 = [0, 1, 2, 3, 4]
        const seasonRewards1 = [4000, 4000, 1500, 300, 200]

        await jet.addStream(
            rewardsToken1,
            tokenOwner1,
            auroraAmountTotal1,
            rewardsTokenAmount1,
            heigth1,
            seasonIndexes1,
            seasonRewards1
        )

        await jet.removeStream(0)
        
        const balanceAfterDeposit = await omg.balanceOf(await user1.getAddress())

        expect((await jet.streams(0)).rewardsToken).to.eq(rewardsToken1)
        expect((await jet.streams(0)).tokenOwner).to.eq(tokenOwner1)
        expect(balanceBeforeDeposit).to.eq(balanceAfterDeposit)
    })

    it("should allow one user to deposit on behalf of another user", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        const user = await user1.getAddress()
        const seasonAmount = 0

        await jet.depositOnBehalfOfAnotherUser(amount, user, seasonAmount)

        const deposit = await jet.deposits(user, 0)

        expect((await aurora.balanceOf(jet.address)).toString()).to.eq(amount.toString())
        expect(deposit.amount.toString()).to.eq(await aurora.balanceOf(jet.address))
        expect(deposit.startSeason.toNumber()).to.eq(0)
        expect(deposit.endSeason.toNumber()).to.eq(0)
        expect(deposit.rewardWeight.toNumber()).to.eq(5)
        expect(deposit.voteWeight.toNumber()).to.eq(0)
    })

    it("should allow one user to deposit on behalf of another user for N seasons", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        const user = await user1.getAddress()
        const seasonAmount = 5

        await jet.depositOnBehalfOfAnotherUser(amount, user, seasonAmount)

        const deposit = await jet.deposits(user, 1)

        expect((await aurora.balanceOf(jet.address)).toString()).to.eq(amount.toString())
        expect(deposit.amount.toString()).to.eq(await aurora.balanceOf(jet.address))
        expect(deposit.startSeason.toNumber()).to.eq(1)
        expect(deposit.endSeason.toNumber()).to.eq(seasonAmount)
        expect(deposit.rewardWeight.toNumber()).to.eq(20)
        expect(deposit.voteWeight.toNumber()).to.eq(20)
    })

    it("should allow user to stake on 0 season", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 0

        await jet.connect(user1).stake(amount, seasonAmount)
        await jet.connect(user1).stake(amount, seasonAmount)

        const deposit = await jet.deposits(await user1.getAddress(), 0)

        expect((await aurora.balanceOf(jet.address)).toString()).to.eq(amount.mul(2).toString())
        expect(deposit.amount.toString()).to.eq(await aurora.balanceOf(jet.address))
        expect(deposit.startSeason.toNumber()).to.eq(0)
        expect(deposit.endSeason.toNumber()).to.eq(0)
        expect(deposit.rewardWeight.toNumber()).to.eq(5)
        expect(deposit.voteWeight.toNumber()).to.eq(0)
    })

    it("should not allow user to claim votes after staking on 0 season", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 0

        await jet.connect(user1).stake(amount, seasonAmount)
        
        expect(jet.connect(user1).claimVote(0)).to.be.revertedWith("Nothing to claim")
    })

    it("should allow user to stake on N seasons", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 5

        await jet.connect(user1).stake(amount, seasonAmount)

        const deposit = await jet.deposits(await user1.getAddress(), 1)

        expect((await aurora.balanceOf(jet.address)).toString()).to.eq(amount.toString())
        expect(deposit.amount.toString()).to.eq(await aurora.balanceOf(jet.address))
        expect(deposit.startSeason.toNumber()).to.eq(1)
        expect(deposit.endSeason.toNumber()).to.eq(seasonAmount)
        expect(deposit.rewardWeight.toNumber()).to.eq(20)
        expect(deposit.voteWeight.toNumber()).to.eq(20)
    })

    it("should not allow user to stake on > 24 seasons", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 25

        expect(jet.connect(user1).stake(amount, seasonAmount)).to.be.revertedWith("Error:seasons")
    })

    it("should not allow user to stake less than 1 Aurora", async () => {
        const amount = ethers.utils.parseUnits("0.5", 18)
        const seasonAmount = 5

        expect(jet.connect(user1).stake(amount, seasonAmount)).to.be.revertedWith("Amount < 5")
    })

    it("should allow to deposit tokens to reward pool", async () => {

        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        expect(await omg.balanceOf(treasury.address)).to.eq(rewardsTokenAmount)
    })

    it("should not allow to claim rewards from blacklisted pool", async () => {

        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]
        const amount = ethers.utils.parseUnits("5", 18)
        const seasonAmount = 5

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        await jet.connect(user1).stake(amount, seasonAmount)
        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)
        await jet.connect(owner).removeTokensFromRewardPool(0)

        expect(jet.connect(user1).claimRewards(0, 0, await user1.getAddress())).to.be.revertedWith("Blacklisted")
    })

    it("should not allow to deposit tokens to reward pool from another user", async () => {

        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        expect(jet.connect(user2).depositTokensToRewardPool(0, rewardsTokenAmount)).to.be.revertedWith("! allowed")
    })

    it("should not allow to deposit tokens to reward pool twice", async () => {

        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        expect(jet.connect(user2).depositTokensToRewardPool(0, rewardsTokenAmount)).to.be.revertedWith("Initialized")
    })

    it("should not allow to deposit zero token amount", async () => {

        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 20
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        expect(jet.connect(user2).depositTokensToRewardPool(0, 0)).to.be.revertedWith("! allowed")
    })

    it("should allow to claim votes", async () => {
        // add stream
        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]
        const BP = 10

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        // deposit reward tokens
        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        // stake from user
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 5

        await jet.connect(user2).stake(amount, seasonAmount)
        await jet.connect(user2).claimVote(1)

        const deposit = await jet.deposits(await user2.getAddress(), 1)

        expect(await jet.balanceOfWithoutDecay(await user2.getAddress())).to.eq(deposit.voteWeight.mul(deposit.amount).div(BP))
        expect(await jet.balanceOf(await user2.getAddress())).to.eq(deposit.voteWeight.mul(deposit.amount).div(BP))
    })

    it("should allow user claimed votes to decay", async () => {
        // add stream
        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]
        const decayGracePeriod = 86400

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        // deposit reward tokens
        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        // stake from user
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 5

        await jet.connect(user2).stake(amount, seasonAmount)
        await jet.connect(user2).claimVote(1)

        expect(parseInt(ethers.utils.formatUnits(
            (await jet.balanceOf(await user2.getAddress())).toString(), 18
        ))).to.eq(200)

        await network.provider.send("evm_increaseTime", [20 * decayGracePeriod]) // increase time for 20 days
        await network.provider.send("evm_mine")

        expect(parseInt(ethers.utils.formatUnits(
            (await jet.balanceOf(await user2.getAddress())).toString(), 18
        ))).to.eq(136)

        await network.provider.send("evm_increaseTime", [30 * decayGracePeriod]) // increase time for 30 days
        await network.provider.send("evm_mine")

        expect(parseInt(ethers.utils.formatUnits(
            (await jet.balanceOf(await user2.getAddress())).toString(), 18
        ))).to.eq(36)

        await network.provider.send("evm_increaseTime", [10 * decayGracePeriod]) // increase time for 10 days
        await network.provider.send("evm_mine")        

        expect(parseInt(ethers.utils.formatUnits(
            (await jet.balanceOf(await user2.getAddress())).toString(), 18
        ))).to.eq(3)
    })

    it("should allow to claim rewards", async () => {
        // add stream
        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]
        const decayGracePeriod = 86400
        const seasonDuration = 5270400

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        // deposit reward tokens
        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        // stake from user
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 5

        await jet.connect(user2).stake(amount, seasonAmount)

        const balanceBefore = await omg.balanceOf(await user2.getAddress())

        await network.provider.send("evm_increaseTime", [2 * decayGracePeriod + seasonDuration])
        await network.provider.send("evm_mine")

        await jet.connect(user2).claimRewards(1, 0, await user2.getAddress())

        const balanceAfter = await omg.balanceOf(await user2.getAddress())
        const diff = balanceAfter.sub(balanceBefore)
        
        expect(parseInt(ethers.utils.formatUnits(diff.toString(), 18))).to.eq(5)
    })

    it("should increase rewards when time is passing", async () => {
        // add stream
        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]
        const decayGracePeriod = 86400
        const seasonDuration = 5270400

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        // deposit reward tokens
        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        // stake from user
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 5

        await jet.connect(user2).stake(amount, seasonAmount)

        let balanceBefore = await omg.balanceOf(await user2.getAddress())

        await network.provider.send("evm_increaseTime", [2 * decayGracePeriod + seasonDuration])
        await network.provider.send("evm_mine")

        await jet.connect(user2).claimRewards(1, 0, await user2.getAddress())

        let balanceAfter = await omg.balanceOf(await user2.getAddress())
        let diff = balanceAfter.sub(balanceBefore)
        
        expect(parseInt(ethers.utils.formatUnits(diff.toString(), 18))).to.eq(5)

        balanceBefore = await omg.balanceOf(await user2.getAddress())

        await network.provider.send("evm_increaseTime", [2 * seasonDuration]) // increase time for 2 seasons
        await network.provider.send("evm_mine")

        await jet.connect(user2).claimRewards(1, 0, await user2.getAddress())

        balanceAfter = await omg.balanceOf(await user2.getAddress())
        diff = balanceAfter.sub(balanceBefore)
        expect(parseInt(ethers.utils.formatUnits(diff.toString(), 18))).to.eq(262)

        balanceBefore = await omg.balanceOf(await user2.getAddress())

        await network.provider.send("evm_increaseTime", [1 * seasonDuration]) // increase time for 1 more season
        await network.provider.send("evm_mine")

        await jet.connect(user2).claimRewards(1, 0, await user2.getAddress())

        balanceAfter = await omg.balanceOf(await user2.getAddress())
        diff = balanceAfter.sub(balanceBefore)
        expect(parseInt(ethers.utils.formatUnits(diff.toString(), 18))).to.eq(48)
    })

    it("should allow to claim rewards after staking on 0 seasons", async () => {
        // add stream
        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]
        const seasonDuration = 5270400

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        // deposit reward tokens
        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        // stake from user
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 0

        await jet.connect(user2).stake(amount, seasonAmount)

        const balanceBefore = await omg.balanceOf(await user2.getAddress())

        await network.provider.send("evm_increaseTime", [2 * seasonDuration])
        await network.provider.send("evm_mine")

        await jet.connect(user2).claimRewards(0, 0, await user2.getAddress())

        const balanceAfter = await omg.balanceOf(await user2.getAddress())
        const diff = balanceAfter.sub(balanceBefore)
        
        expect(parseInt(ethers.utils.formatUnits(diff.toString(), 18))).to.eq(166)
    })

    it("should allow to claim and to increase claimed aurora for token owner", async () => {
        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]
        const seasonDuration = 5270400

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        let balanceBefore = await aurora.balanceOf(await user1.getAddress())

        await network.provider.send("evm_increaseTime", [2 * seasonDuration]) // increase time for 1 more season
        await network.provider.send("evm_mine")

        await jet.connect(user1).claimAuroraByTokenOwner(0)

        let balanceAfter = await aurora.balanceOf(await user1.getAddress())
        let diff = balanceAfter.sub(balanceBefore)

        expect(parseInt(ethers.utils.formatUnits(diff.toString(), 18))).to.approximately(500, 1)   

        balanceBefore = await aurora.balanceOf(await user1.getAddress())

        await network.provider.send("evm_increaseTime", [seasonDuration]) // increase time for 1 more season
        await network.provider.send("evm_mine")

        await jet.connect(user1).claimAuroraByTokenOwner(0)

        balanceAfter = await aurora.balanceOf(await user1.getAddress())
        diff = balanceAfter.sub(balanceBefore)

        expect(parseInt(ethers.utils.formatUnits(diff.toString(), 18))).to.approximately(300, 1)  
        
        balanceBefore = await aurora.balanceOf(await user1.getAddress())

        await network.provider.send("evm_increaseTime", [seasonDuration]) // increase time for 1 more season
        await network.provider.send("evm_mine")

        await jet.connect(user1).claimAuroraByTokenOwner(0)

        balanceAfter = await aurora.balanceOf(await user1.getAddress())
        diff = balanceAfter.sub(balanceBefore)

        expect(parseInt(ethers.utils.formatUnits(diff.toString(), 18))).to.approximately(150, 1)  

        balanceBefore = await aurora.balanceOf(await user1.getAddress())

        await network.provider.send("evm_increaseTime", [seasonDuration]) // increase time for 1 more season
        await network.provider.send("evm_mine")

        await jet.connect(user1).claimAuroraByTokenOwner(0)

        balanceAfter = await aurora.balanceOf(await user1.getAddress())
        diff = balanceAfter.sub(balanceBefore)

        expect(parseInt(ethers.utils.formatUnits(diff.toString(), 18))).to.approximately(30, 1)  

        balanceBefore = await aurora.balanceOf(await user1.getAddress())

        await network.provider.send("evm_increaseTime", [seasonDuration]) // increase time for 1 more season
        await network.provider.send("evm_mine")

        await jet.connect(user1).claimAuroraByTokenOwner(0)

        balanceAfter = await aurora.balanceOf(await user1.getAddress())
        diff = balanceAfter.sub(balanceBefore)

        expect(parseInt(ethers.utils.formatUnits(diff.toString(), 18))).to.approximately(20, 1)  
    })

    it("should not allow to burn user unused tokens by admin before burn grace perion", async () => {
        // add stream
        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]
        const seasonDuration = 5270400

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        // deposit reward tokens
        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        // stake from user
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 5

        await jet.connect(user2).stake(amount, seasonAmount)
        await jet.connect(user2).claimVote(1)

        await network.provider.send("evm_increaseTime", [seasonDuration]) // increase time for 1 more season
        await network.provider.send("evm_mine")

        expect(jet.connect(owner).burnUnused(await user2.getAddress())).to.be.revertedWith("! allowed")
    })

    it("should allow to burn user unused tokens by admin after burn grace perion", async () => {
        // add stream
        const rewardsToken = omg.address 
        const tokenOwner = await user1.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 10
        const seasonIndexes = [1, 2, 3, 4, 5]
        const seasonRewards = [5000, 3000, 1500, 300, 200]
        const seasonDuration = 5270400
        const burnGracePeriod = 86400 * 55 + 1

        await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        // deposit reward tokens
        await omg.connect(user1).approve(jet.address, rewardsTokenAmount)
        await jet.connect(user1).depositTokensToRewardPool(0, rewardsTokenAmount)

        // stake from user
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 5

        await jet.connect(user2).stake(amount, seasonAmount)
        await jet.connect(user2).claimVote(1)

        await network.provider.send("evm_increaseTime", [seasonDuration + burnGracePeriod])
        await network.provider.send("evm_mine")

        await jet.connect(owner).burnUnused(await user2.getAddress())

        const balanceAfter = await jet.balanceOf(await user2.getAddress())

        expect(parseInt(ethers.utils.formatUnits(balanceAfter, 18))).to.eq(0)
    })

    it("should able to update season data", async () => {
        
        const seasonNumbers = 24
        const seasonDuration = 5270400 // 61 days in seconds (two month)
        const decayGracePeriod = 86400

        const seasonN = await jet.seasons(seasonNumbers - 1)
        const lastSeasonEnds = seasonN.endSeason.toNumber()

        await jet.configureSeason(
            lastSeasonEnds,                          // _startSeason
            lastSeasonEnds + 1,                      // _applicationStart
            lastSeasonEnds + 1 + seasonDuration,     // _applicationEnd
            lastSeasonEnds + 1,                      // _applicationVotingStart
            lastSeasonEnds + 1 + seasonDuration,     // _applicationVotingEnd
            lastSeasonEnds + 1,                      // _startVoting
            lastSeasonEnds + 1 + seasonDuration,     // _endVoting
            lastSeasonEnds + 1 + seasonDuration,     // _endSeason
            lastSeasonEnds + 1 + decayGracePeriod,   // _decayStart
            seasonNumbers - 1                        // _index
        )
        const season = await jet.seasons(seasonNumbers - 1)
        expect(season.startSeason.toNumber()).to.eq(lastSeasonEnds)
        // reset the session configuration to previous setup.
        await jet.configureSeason(
            lastSeasonEnds + 1,                      // _startSeason
            lastSeasonEnds + 1,                      // _applicationStart
            lastSeasonEnds + 1 + seasonDuration,     // _applicationEnd
            lastSeasonEnds + 1,                      // _applicationVotingStart
            lastSeasonEnds + 1 + seasonDuration,     // _applicationVotingEnd
            lastSeasonEnds + 1,                      // _startVoting
            lastSeasonEnds + 1 + seasonDuration,     // _endVoting
            lastSeasonEnds + 1 + seasonDuration,     // _endSeason
            lastSeasonEnds + 1 + decayGracePeriod,   // _decayStart
            seasonNumbers - 1                        // _index
        )
    })

    it("should whitelist contract only by admin", async () => {
        await jet.connect(owner).whitelistContract(
            sampleTokenContract.address,
            true
        )
        expect(
            await jet.whitelistedContracts(sampleTokenContract.address)
        ).to.eq(true)
    })

    it("should allow batch whitelisting only by admin", async () => {
        await jet.connect(owner).batchWhitelistContract(
            [sampleTokenContract.address, hex.address, omg.address],
            [false, true, true]
        )
        expect(
            await jet.whitelistedContracts(sampleTokenContract.address)
        ).to.eq(false)
        
        expect(
            await jet.whitelistedContracts(hex.address)
        ).to.eq(true)

        expect(
            await jet.whitelistedContracts(omg.address)
        ).to.eq(true)
    })

    it("should allow admin to deposit tokens to reward pool", async () => {
        const rewardsToken = sampleTokenContract.address 
        const tokenOwner = await owner.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 20
        const seasonIndexes = [0, 1, 2, 3, 4]
        const seasonRewards = [4000, 4000, 1500, 300, 200]

        const tx = await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )
        // get stream index
        const abi = ["event StreamAdded(uint256 indexed streamIndex,address indexed rewardsToken,address indexed tokenOwner,uint256 auroraAmountTotal,uint256 rewardsTokenAmount,uint256 height,uint256 lastAuroraClaimed)"];
        const iface = new ethers.utils.Interface(abi);
        const receipt = await ethers.provider.getTransactionReceipt(tx.hash)
        const log = iface.parseLog(receipt.logs[2]);
        const {streamIndex,} = log.args;
        // deposit tokens to rewards pool
        await sampleTokenContract.connect(owner).approve(jet.address, rewardsTokenAmount)
        await jet.connect(owner).depositTokensToRewardPool(streamIndex, rewardsTokenAmount)
        const newRewardsTokenAmount = ethers.utils.parseUnits("2000", 18)
        // add extra tokens tokens to rewards pool
        await sampleTokenContract.connect(owner).approve(jet.address, newRewardsTokenAmount)
        await jet.connect(owner).addTokensToRewardPool(streamIndex, newRewardsTokenAmount)

        expect(
            await jet.rewardsPool(rewardsToken)
        ).to.eq(
            rewardsTokenAmount.add(newRewardsTokenAmount)
        )
    })

    it("should fail to add tokens to reward pool if pool is blacklisted", async () => {
        const rewardsToken = sampleTokenContract.address 
        await treasury.connect(owner).addSupportedToken(rewardsToken)
        const tokenOwner = await owner.getAddress()
        const auroraAmountTotal = ethers.utils.parseUnits("1000", 18)
        const rewardsTokenAmount = ethers.utils.parseUnits("3333", 18)
        const heigth = (await ethers.provider.getBlock("latest")).timestamp + 20
        const seasonIndexes = [0, 1, 2, 3, 4]
        const seasonRewards = [4000, 4000, 1500, 300, 200]

        const tx = await jet.addStream(
            rewardsToken,
            tokenOwner,
            auroraAmountTotal,
            rewardsTokenAmount,
            heigth,
            seasonIndexes,
            seasonRewards
        )

        // get stream index
        const abi = ["event StreamAdded(uint256 indexed streamIndex,address indexed rewardsToken,address indexed tokenOwner,uint256 auroraAmountTotal,uint256 rewardsTokenAmount,uint256 height,uint256 lastAuroraClaimed)"];
        const iface = new ethers.utils.Interface(abi);
        const receipt = await ethers.provider.getTransactionReceipt(tx.hash)
        const log = iface.parseLog(receipt.logs[2]);
        const {streamIndex,} = log.args;
        // deposit tokens to rewards pool
        await sampleTokenContract.connect(owner).approve(jet.address, rewardsTokenAmount)
        await jet.connect(owner).depositTokensToRewardPool(streamIndex, rewardsTokenAmount)
        await jet.connect(owner).removeTokensFromRewardPool(streamIndex) // blacklist reward pool

        expect(await jet.rewardsPool(rewardsToken)).to.eq(0)
        // add extra tokens tokens to rewards pool
        await sampleTokenContract.connect(owner).approve(jet.address, rewardsTokenAmount)
        expect(
            jet.connect(owner).addTokensToRewardPool(streamIndex, rewardsTokenAmount)
        ).to.be.revertedWith("Blacklisted stream")
    })

    it("should fail to call transafer",async () => {
        expect(
            jet.connect(owner).transfer(user1.getAddress(), 1000)
        ).to.be.reverted
    })

    it("should fail to call approve", async () => {
        expect(
            jet.connect(owner).approve(user1.getAddress(), 1000)
        ).to.be.reverted
    })

    it("should allow unstaknig tokens for zero season(s)", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 0
        await aurora.connect(owner).approve(jet.address, amount);
        await jet.connect(owner).stake(amount, seasonAmount)
        const decayGracePeriod = 86400
        await network.provider.send("evm_increaseTime", [90 * decayGracePeriod])
        await network.provider.send("evm_mine")
        await jet.connect(owner).unstake(0)
    })

    it("should allow unstaknig tokens for N=1 season(s)", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 1
        await aurora.connect(owner).approve(jet.address, amount);
        await jet.connect(owner).stake(amount, seasonAmount)
        const decayGracePeriod = 86400
        await network.provider.send("evm_increaseTime", [181 * decayGracePeriod]) 
        await network.provider.send("evm_mine")
        await jet.connect(owner).unstake(0)
        await jet.connect(owner).unstake(1)
    })

    it("should get deposit amount", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 0
        await aurora.connect(owner).approve(jet.address, amount);
        await jet.connect(owner).stake(amount, seasonAmount)
        expect(
            await jet.getDepositAmount(0)
        ).to.be.eq(amount)
    })

    it("should get deposit start season, end season, reward and vote weight", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        const seasonAmount = 2
        await aurora.connect(owner).approve(jet.address, amount)
        await jet.connect(owner).stake(amount, seasonAmount)
        const decayGracePeriod = 86400
        await network.provider.send("evm_increaseTime", [20 * decayGracePeriod]) // increase time for 20 days
        await network.provider.send("evm_mine")
        
        expect(await jet.connect(owner).getDepositStartSeason(1)).to.be.eq(1)
        expect(await jet.connect(owner).getDepositEndSeason(1)).to.be.eq(2)
        expect(await jet.connect(owner).getDepositRewardWeight(1)).to.be.eq(11)
        expect(await jet.connect(owner).getDepositVoteWeight(1)).to.be.eq(11)
    })

    it("should allow admin to mint and burn vote tokens", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        await jet.connect(owner).mint(user1.getAddress(), amount)
        expect(
            await jet.balanceOfWithoutDecay(user1.getAddress())
        ).to.be.eq(amount)
        await jet.connect(owner).burn(user1.getAddress(), amount)
        expect(
            await jet.balanceOfWithoutDecay(user1.getAddress())
        ).to.be.eq(ethers.utils.parseUnits("0", 18))
    })

    it("shoul allow admin to batch mint and batch burn", async () => {
        const amount = ethers.utils.parseUnits("100", 18)
        await jet.connect(owner).mintBatch(
            [
                user1.getAddress(),
                user2.getAddress()
            ],
            [
                amount,
                amount
            ]
        )
        expect(
        await jet.balanceOfWithoutDecay(user1.getAddress())
        ).to.be.eq(amount)
        expect(
            await jet.balanceOfWithoutDecay(user2.getAddress())
        ).to.be.eq(amount)
        await jet.connect(owner).burnBatch(
            [
                user1.getAddress(),
                user2.getAddress()
            ],
            [
                amount,
                amount
            ]
        )
        expect(
            await jet.balanceOfWithoutDecay(user1.getAddress())
        ).to.be.eq(ethers.utils.parseUnits("0", 18))
        expect(
            await jet.balanceOfWithoutDecay(user2.getAddress())
        ).to.be.eq(ethers.utils.parseUnits("0", 18))
    })

    it("should allow whitelisted contract to call transferFrom", async () => {
        await jet.connect(owner).whitelistContract(
            sampleTokenContract.address,
            true
        )
        expect(
            await jet.whitelistedContracts(sampleTokenContract.address)
        ).to.eq(true)

        // stake for 4 seasons
        const amount = ethers.utils.parseUnits("10", 18)
        const seasonAmount = 3
        const decayGracePeriod = 86400
        await jet.connect(user1).stake(amount, seasonAmount)
        // accelerate the season
        await network.provider.send("evm_increaseTime", [550 * decayGracePeriod]) // increase time for 20 days
        await network.provider.send("evm_mine")
        await jet.connect(user1).claimVote(1)
        await sampleTokenContract.transferFromVoteTokens(
            jet.address,
            await user1.getAddress(),
            await user2.getAddress(),
            ethers.utils.parseUnits("1", 18)
        )
        expect(
            await jet.balanceOfWithoutDecay(await user2.getAddress())
        ).to.be.eq(ethers.utils.parseUnits("1", 18))
    })

    // it("should allow whitelisted contract to call transferFrom if block.timestamp <= season.decayStart", async () => {
    //     await jet.connect(owner).whitelistContract(
    //         sampleTokenContract.address,
    //         true
    //     )
    //     expect(
    //         await jet.whitelistedContracts(sampleTokenContract.address)
    //     ).to.eq(true)

    //     // stake for 4 seasons
    //     const amount = ethers.utils.parseUnits("10", 18)
    //     const seasonAmount = 2
    //     const decayGracePeriod = 86400
    //     await jet.connect(user1).stake(amount, seasonAmount)
    //     // accelerate the season
    //     await network.provider.send("evm_increaseTime", [160 * decayGracePeriod]) // increase time for 20 days
    //     await network.provider.send("evm_mine")
    //     await jet.connect(user1).claimVote(1)
    //     await sampleTokenContract.transferFromVoteTokens(
    //         jet.address,
    //         await user1.getAddress(),
    //         await user2.getAddress(),
    //         ethers.utils.parseUnits("1", 18)
    //     )
    //     expect(
    //         await jet.balanceOfWithoutDecay(await user2.getAddress())
    //     ).to.be.eq(ethers.utils.parseUnits("1", 18))
    // })
})
