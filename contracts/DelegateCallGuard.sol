// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

/**
 * @title AdminControlled
 * @author Aurora Team
 *
 * @dev Implementation of delegatecall guard contract
 *
 *      This abstract contract is only used by the adminControlled in order to
 *      guard any unsafe delegatcall and check that is only called throught the
 *      proxy contract not the implementation contract.
 *      More details https://docs.openzeppelin.com/upgrades-plugins/1.x/faq#delegatecall-selfdestruct
 */
abstract contract DelegateCallGuard {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable state-variable-assignment
    address private immutable self = address(this);

    /// @dev checkDelegateCall checks that the delegate call goes through
    /// the proxy contract not the implimentation contract.
    function checkDelegateCall() private view {
        require(address(this) != self);
    }

    modifier onlyDelegateCall() {
        checkDelegateCall();
        _;
    }
}
