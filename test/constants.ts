export const eventsABI = {
    staked: ["event Staked(address indexed user, uint256 amount, uint256 timestamp)"],
    unstaked: ["event Unstaked(address indexed user, uint256 amount, uint256 timestamp)"],
    pending: ["event Pending(uint256 indexed streamId, address indexed user, uint256 amount, uint256 timestamp)"],
    released: ["event Released(uint256 indexed streamId, address indexed user, uint256 amount, uint256 timestamp)"],
    streamActivated: ["event StreamActivated(address indexed stream, uint256 index, uint256 timestamp)"]
}