// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0 <0.9.0;

interface IIdleCDORegistry {
    function isValidCdo(address) external view returns (bool);

    function owner() external view returns (address);

    function renounceOwnership() external;

    function toggleCDO(address _cdo, bool _valid) external;

    function transferOwnership(address newOwner) external;
}
