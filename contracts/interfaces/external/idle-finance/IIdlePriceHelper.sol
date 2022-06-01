// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0 <0.9.0;

interface IIdlePriceHelper {
  function FULL_ALLOC() external view returns (uint256);

  function getMintingPrice(address idleYieldToken)
      external
      view
      returns (uint256 mintingPrice);

  function getRedeemPrice(address idleYieldToken, address user)
      external
      view
      returns (uint256 redeemPrice);

  function getRedeemPrice(address idleYieldToken)
      external
      view
      returns (uint256 redeemPrice);
}
