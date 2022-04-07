export const eventsABI = {
    staked: ["event Staked(address indexed user, uint256 amount, uint256 shares, uint256 timestamp)"],
    unstaked: ["event Unstaked(address indexed user, uint256 amount, uint256 shares, uint256 timestamp)"],
    pending: ["event Pending(uint256 indexed streamId, address indexed user, uint256 amount, uint256 timestamp)"],
    released: ["event Released(uint256 indexed streamId, address indexed user, uint256 amount, uint256 timestamp)"],
    streamProposed: ["event StreamProposed(uint256 indexed streamId, address indexed owner, uint256 timestamp)"],
    streamCreated: ["event StreamCreated(uint256 indexed streamId, address indexed owner, uint256 timestamp)"],
    streamRemoved: ["event StreamRemoved(uint256 indexed streamId, address indexed owner, uint256 timestamp)"]
}