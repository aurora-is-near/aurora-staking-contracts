async function main() {
  const iface = new ethers.utils.Interface([
    "function upgradeTo(address newImplementation)"
  ])
  const encoded = iface.encodeFunctionData(
    "upgradeTo",
    //TODO: replace this address
    ["0xEF72330b252490648D01B242eCfFbb10b3C01B61"] // add the new implementation contract address here
  )

  console.log(`Hex data for upgradeTo request: ${encoded}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
