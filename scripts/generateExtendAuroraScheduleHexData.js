const hre = require("hardhat");

async function main() {
    // v2 extendAuroraStreamSchedule()
    const scheduleTimes = [
      1684359600,
      1692243600,
      1700127600,
      1708011600,
      1715895600,
      1723779600,
      1731663600,
      1739547600,
      1747431600,
      1755315600,
      1763199600,
      1771083600,
      1778967600,
      1786851600,
      1794735600,
      1802619600,
      1810503600
    ]
    const scheduleRewards = [
        hre.ethers.utils.parseUnits("25000000000000000000000000", 0),
        hre.ethers.utils.parseUnits("22880164035800712399576353", 0),
        hre.ethers.utils.parseUnits("20850202160997070157914348", 0),
        hre.ethers.utils.parseUnits("18906304009996889214243076", 0),
        hre.ethers.utils.parseUnits("17044820763259834632541112", 0),
        hre.ethers.utils.parseUnits("15262258299223413269846877", 0),
        hre.ethers.utils.parseUnits("13555270635616230352615362", 0),
        hre.ethers.utils.parseUnits("11920653648838046915547231", 0),
        hre.ethers.utils.parseUnits("10355339059617517999018995", 0),
        hre.ethers.utils.parseUnits("8856388673658311517125555", 0),
        hre.ethers.utils.parseUnits("7420988866462936995313201", 0),
        hre.ethers.utils.parseUnits("6046445301981950352017841", 0),
        hre.ethers.utils.parseUnits("4730177875175105890065797", 0),
        hre.ethers.utils.parseUnits("3469715868991323523218041", 0),
        hre.ethers.utils.parseUnits("2262693316676816914880613", 0),
        hre.ethers.utils.parseUnits("1106844560706142125623060", 0),
        hre.ethers.utils.parseUnits("0",0)
      ];

      const iface = new hre.ethers.utils.Interface([
        "function extendAuroraStreamSchedule(uint256[] memory scheduleTimes, uint256[] memory scheduleRewards) external"
      ])
      const encoded = iface.encodeFunctionData(
        "extendAuroraStreamSchedule",
        [scheduleTimes, scheduleRewards]
      )
      console.log(`Hex data for extending schedule request: ${encoded}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
