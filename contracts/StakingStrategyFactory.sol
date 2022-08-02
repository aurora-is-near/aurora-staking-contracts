// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./AdminControlled.sol";
import "./templates/IStakingStrategyTemplate.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

contract JetStakingStrategyFactory is AdminControlled {
    using ClonesUpgradeable for address;
    using AddressUpgradeable for address;

    struct StakingStrategyClone {
        uint256 templateId;
        address instance;
    }

    address stakingContract;
    address[] public templates;
    // mapping owners to clones
    mapping(address => StakingStrategyClone[]) public clones;

    //events
    event Cloned(address indexed instance, address indexed owner);

    event TemplateAdded(uint256 indexed index, address indexed template);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address templateImplementation,
        address stakingContractAddr,
        uint256 controlledAdminFlags
    ) external initializer {
        require(
            templateImplementation != address(0) &&
                stakingContractAddr != address(0),
            "INVALID_ADDRESS"
        );
        __AdminControlled_init(controlledAdminFlags);
        stakingContract = stakingContractAddr;
        emit TemplateAdded(templates.length, templateImplementation);
        templates.push(templateImplementation);
    }

    function clone(uint256 templateId, bytes memory extraInitParameters)
        public
        virtual
        pausable(1)
    {
        require(templates[templateId] != address(0), "INVALID_TEMPLATE_ID");
        address instance = _cloneWithContractInitialization(
            templateId,
            msg.sender,
            extraInitParameters
        );
        emit Cloned(instance, msg.sender);
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
        bytes memory _extraInitParameters
    ) internal virtual returns (address instance) {
        instance = templates[_templateId].clone();
        // initialize the clone
        IStakingStrategyTemplate(instance).initialize(
            stakingContract,
            _cloneOwner,
            _extraInitParameters
        );
    }
}
