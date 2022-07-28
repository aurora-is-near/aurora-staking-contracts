// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./AdminControlled.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

contract StakingFactory is AdminControlled {
    using ClonesUpgradeable for address;
    using AddressUpgradeable for address;
    //TODO: update the template structure
    struct Template {
        address implementation;
        address owner;
    }
    struct Clone {
        uint256 templateId;
        address instance;
    }

    bytes32 public constant TEMPLATE_MANAGER_ROLE =
        keccak256("TEMPLATE_MANAGER_ROLE");
    Template[] public templates;
    // mapping owners to clones
    mapping(address => Clone[]) public clones;

    //events
    event Cloned(address indexed instance, address indexed owner);

    event TemplateAdded(
        uint256 indexed index,
        address indexed template,
        address indexed owner
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _template, uint256 _flags)
        external
        initializer
    {
        __AdminControlled_init(_flags);
        _grantRole(TEMPLATE_MANAGER_ROLE, msg.sender);
        emit TemplateAdded(templates.length, _template, msg.sender);
        templates.push(
            Template({implementation: _template, owner: msg.sender})
        );
    }

    function clone(uint256 templateId, bytes memory data) public virtual {
        require(
            templates[templateId].implementation != address(0),
            "INVALID_TEMPLATE_ID"
        );
        // make sure to include the msg.sender in `data`, so
        // that user will be the owner of the new instance.
        address instance = _cloneWithContractInitialization(templateId, data);
        emit Cloned(instance, msg.sender);
        clones[msg.sender].push(
            Clone({templateId: templateId, instance: instance})
        );
    }

    function addTemplate(address _implementation)
        public
        virtual
        onlyRole(TEMPLATE_MANAGER_ROLE)
    {
        require(_implementation != address(0), "INVALID_TEMPLATE_ADDRESS");
        emit TemplateAdded(templates.length, _implementation, msg.sender);
        templates.push(
            Template({implementation: _implementation, owner: msg.sender})
        );
    }

    function _cloneWithContractInitialization(
        uint256 templateId,
        bytes memory data
    ) internal virtual returns (address instance) {
        instance = templates[templateId].implementation.clone();
        // initialize the clone
        if (data.length > 0) instance.functionCall(data);
    }
}
