async function main() {
  const iface = new ethers.utils.Interface([
    "function adminPause(uint256 flags)"
  ])
  const encoded = iface.encodeFunctionData(
    "adminPause",
    [0] // use `1` for pausing and `0` for unpausing
  )

  console.log(`Hex data for adminPause request: ${encoded}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});
