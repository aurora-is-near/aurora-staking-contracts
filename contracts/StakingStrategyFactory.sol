// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./AdminControlled.sol";
import "./templates/IStakingStrategyTemplate.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract StakingStrategyFactory is AdminControlled {
    using ClonesUpgradeable for address;
    using AddressUpgradeable for address;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct StakingStrategyClone {
        uint256 templateId;
        address instance;
    }

    address public stakingContract;
    address public auroraToken;
    address[] public templates;
    // mapping owners to clones
    mapping(address => StakingStrategyClone[]) public clones;

    //events
    event TemplateCloned(address indexed instance, address indexed owner);

    event TemplateAdded(uint256 indexed index, address indexed template);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address templateImplementation,
        address stakingContractAddr,
        address auroraTokenAddr,
        uint256 controlledAdminFlags
    ) external initializer {
        require(
            templateImplementation != address(0) &&
                stakingContractAddr != address(0) &&
                auroraTokenAddr != address(0),
            "INVALID_ADDRESS"
        );
        __AdminControlled_init(controlledAdminFlags);
        stakingContract = stakingContractAddr;
        auroraToken = auroraTokenAddr;
        emit TemplateAdded(templates.length, templateImplementation);
        templates.push(templateImplementation);
    }

    function emitMyEvent() public {
        emit TemplateCloned(msg.sender, msg.sender);
    }

    function cloneTemplate(
        uint256 templateId,
        uint256 amount,
        bytes memory extraInitParameters
    ) public virtual pausable(1) {
        require(templates[templateId] != address(0), "INVALID_TEMPLATE_ID");
        address instance = _cloneWithContractInitialization(
            templateId,
            msg.sender,
            amount,
            extraInitParameters
        );
        clones[msg.sender].push(
            StakingStrategyClone({templateId: templateId, instance: instance})
        );
    }

    function addTemplate(address templateImplementation)
        public
        virtual
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            templateImplementation != address(0),
            "INVALID_TEMPLATE_ADDRESS"
        );
        emit TemplateAdded(templates.length, templateImplementation);
        templates.push(templateImplementation);
    }

    function _cloneWithContractInitialization(
        uint256 _templateId,
        address _cloneOwner,
        uint256 _deposit,
        bytes memory _extraInitParameters
    ) internal virtual returns (address instance) {
        instance = templates[_templateId].clone();
        emit TemplateCloned(instance, msg.sender);
        // transfer tokens to the new instance
        IERC20Upgradeable(auroraToken).safeTransferFrom(
            msg.sender,
            instance,
            _deposit
        );
        // initialize the clone
        IStakingStrategyTemplate(instance).initialize(
            stakingContract,
            _cloneOwner,
            false,
            _extraInitParameters
        );
    }
}
