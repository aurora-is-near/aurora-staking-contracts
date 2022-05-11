export const eventsABI = {
    staked: ["event Staked(address indexed user, uint256 amount, uint256 shares)"],
    unstaked: ["event Unstaked(address indexed user, uint256 amount)"],
    pending: ["event Pending(uint256 indexed streamId, address indexed user, uint256 amount)"],
    released: ["event Released(uint256 indexed streamId, address indexed user, uint256 amount)"],
    streamProposed: ["event StreamProposed(uint256 indexed streamId, address indexed owner, address indexed token, uint256 maxDepositAmount, uint256 auroraDepositAmount)"],
    streamCreated: ["event StreamCreated(uint256 indexed streamId, address indexed owner, address indexed token, uint256 tokenAmount, uint256 auroraAmount)"],
    streamRemoved: ["event StreamRemoved(uint256 indexed streamId, address indexed owner, address indexed token)"]
}