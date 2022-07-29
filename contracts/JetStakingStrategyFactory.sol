// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./AdminControlled.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

contract JetStakingStrategyFactory is AdminControlled {
    using ClonesUpgradeable for address;
    using AddressUpgradeable for address;

    struct Clone {
        uint256 templateId;
        address instance;
    }

    address[] public templates;
    // mapping owners to clones
    mapping(address => Clone[]) public clones;

    //events
    event Cloned(address indexed instance, address indexed owner);

    event TemplateAdded(uint256 indexed index, address indexed template);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _template, uint256 _flags)
        external
        initializer
    {
        __AdminControlled_init(_flags);
        emit TemplateAdded(templates.length, _template);
        templates.push(_template);
    }

    function clone(uint256 templateId, bytes memory data)
        public
        virtual
        pausable(1)
    {
        require(templates[templateId] != address(0), "INVALID_TEMPLATE_ID");
        // make sure to include the msg.sender in `data`, so
        // that user will be the owner of the new instance.
        address instance = _cloneWithContractInitialization(templateId, data);
        emit Cloned(instance, msg.sender);
        clones[msg.sender].push(
            Clone({templateId: templateId, instance: instance})
        );
    }

    function addTemplate(address _template)
        public
        virtual
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_template != address(0), "INVALID_TEMPLATE_ADDRESS");
        emit TemplateAdded(templates.length, _template);
        templates.push(_template);
    }

    function _cloneWithContractInitialization(
        uint256 templateId,
        bytes memory data
    ) internal virtual returns (address instance) {
        instance = templates[templateId].clone();
        // initialize the clone
        if (data.length > 0) instance.functionCall(data);
    }
}
