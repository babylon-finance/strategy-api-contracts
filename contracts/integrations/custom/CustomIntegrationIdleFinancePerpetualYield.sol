// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.7.6;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IBabController} from '../../interfaces/IBabController.sol';
import {IIdleCDO} from '../../interfaces/external/idle-finance/IIdleCDO.sol';
import {IIdleCDORegistry} from '../../interfaces/external/idle-finance/IIdleCDORegistry.sol';
import {IIdleCDOTranche} from '../../interfaces/external/idle-finance/IIdleCDOTranche.sol';
import {IIdleCDOTrancheRewards} from '../../interfaces/external/idle-finance/IIdleCDOTrancheRewards.sol';
import {CustomIntegration} from './CustomIntegration.sol';
import {PreciseUnitMath} from '../../lib/PreciseUnitMath.sol';
import {LowGasSafeMath} from '../../lib/LowGasSafeMath.sol';
import {BytesLib} from '../../lib/BytesLib.sol';
import {ControllerLib} from '../../lib/ControllerLib.sol';

/**
 * @title CustomIntegrationIdleFinanceBestYield
 * @author adamb
 *
 * Custom integration for Idle.Finance
 */
contract CustomIntegrationIdleFinancePerpetualYield is CustomIntegration {
    using LowGasSafeMath for uint256;
    using PreciseUnitMath for uint256;
    using BytesLib for uint256;
    using ControllerLib for IBabController;

    uint constant IDLE_TRANCHE_TYPE_JUNIOR = 1; // BB
    uint constant IDLE_TRANCHE_TYPE_SENIOR = 2; // AA

    /* ============ State Variables ============ */

    /* Add State variables here if any. Pass to the constructor */
    IIdleCDORegistry private immutable idleCDORegistry;

    /* ============ Constructor ============ */

    /**
     * Creates the integration
     *
     * @param _controller                   Address of the controller
     */
    constructor(IBabController _controller, IIdleCDORegistry _idleCDORegistry) CustomIntegration('custom_idle_finance_perpetual_yield', _controller) {
        require(address(_controller) != address(0), 'invalid address');
        idleCDORegistry = _idleCDORegistry;
    }

    /* =============== Internal Functions ============== */

    /**
     * Whether or not the data provided is valid
     *
     * hparam  _data                     Data provided
     * @return bool                      True if the data is correct
     */
    function _isValid(bytes memory _data) internal view override returns (bool) {
      return _isValidIdleTranche(BytesLib.decodeOpDataAddressAssembly(_data, 12));
    }

    /**
     * Which address needs to be approved (IERC-20) for the input tokens.
     *
     * hparam  _data                     Data provided
     * hparam  _opType                   O for enter, 1 for exit
     * @return address                   Address to approve the tokens to
     */
    function _getSpender(
        bytes calldata _data,
        uint8 /* _opType */
    ) internal view override returns (address) {
      return _getCDOAddress(BytesLib.decodeOpDataAddressAssembly(_data, 12));
    }

    /**
     * The address of the IERC-20 token obtained after entering this operation
     *
     * @param  _address                   Address provided as param
     * @return address                    Address of the resulting lp token
     */
    function _getResultToken(address _address) internal pure override returns (address) {
      return _address;
    }

    /**
     * Return enter custom calldata
     *
     * hparam  _strategy                 Address of the strategy
     * hparam  _data                     OpData e.g. Address of the pool
     * hparam  _resultTokensOut          Amount of result tokens to send
     * hparam  _tokensIn                 Addresses of tokens to send to spender to enter
     * hparam  _maxAmountsIn             Amounts of tokens to send to spender
     *
     * @return address                   Target contract address
     * @return uint256                   Call value
     * @return bytes                     Trade calldata
     */
    function _getEnterCalldata(
        address, /* _strategy */
        bytes calldata _data,
        uint256, /* _resultTokensOut */
        address[] calldata _tokensIn,
        uint256[] calldata _maxAmountsIn
    )
        internal
        view
        override
        returns (
            address,
            uint256,
            bytes memory
        )
    {
        address trancheAddress = BytesLib.decodeOpDataAddressAssembly(_data, 12);
        uint trancheType = _getTrancheType(trancheAddress);
        require(_tokensIn.length == 1 && _maxAmountsIn.length == 1, 'Wrong amount of tokens provided');

        bytes memory methodData;
        if (trancheType == IDLE_TRANCHE_TYPE_JUNIOR) {
          methodData = abi.encodeWithSelector(
            IIdleCDO.depositBB.selector,
            _maxAmountsIn[0]
          );
        } else if (trancheType == IDLE_TRANCHE_TYPE_SENIOR) {
          methodData = abi.encodeWithSelector(
            IIdleCDO.depositAA.selector,
            _maxAmountsIn[0]
          );
        } else {
          revert("invalid tranche type");
        }

        return (_getCDOAddress(trancheAddress), 0, methodData);
    }


    // Staking disabled for now, since the staking contract does not return an ERC20 receipt token
    // Ref: https://discord.com/channels/810255586235121724/935207033806934026/980654730520965151

    // /**
    //  * (OPTIONAL) Return post action calldata
    //  *
    //  * hparam  _strategy                 Address of the strategy
    //  * hparam  _asset                    Address param
    //  * hparam  _amount                   Amount
    //  * hparam  _customOp                 Type of op
    //  *
    //  * @return address                   Target contract address
    //  * @return uint256                   Call value
    //  * @return bytes                     Trade calldata
    //  */
    // function _getPostActionCallData(
    //     address, /* _strategy */
    //     address _asset,
    //     uint256 _amount,
    //     uint256 _customOp
    // )
    //     internal
    //     view
    //     override
    //     returns (
    //         address,
    //         uint256,
    //         bytes memory
    //     )
    // {
    //   if (_customOp == 0) { // enter
    //     address cdoAddress = _getCDOAddress(_asset);
    //     address stakingAddress = _getTrancheType(_asset) == IDLE_TRANCHE_TYPE_SENIOR ? IIdleCDO(cdoAddress).AAStaking() : IIdleCDO(cdoAddress).BBStaking();

    //     bytes memory methodData = abi.encodeWithSelector(
    //       IIdleCDOTrancheRewards.stake.selector,
    //       _amount
    //     );

    //     return (stakingAddress, 0, methodData);
    //   } else {
    //     return (address(0), 0, bytes(''));
    //   }
    // }

    // /**
    //  * (OPTIONAL). Whether or not the post action needs an approval
    //  * Only makes sense if _getPostActionCallData is filled.
    //  *
    //  * hparam  _asset                     Asset passed as param
    //  * hparam  _customOp                  0 for enter, 1 for exit
    //  * @return address                    Address of the asset to approve
    //  * @return address                    Address to approve
    //  */
    // function _postActionNeedsApproval(
    //     address _asset,
    //     uint8 _customOp
    // ) internal view override returns (address, address) {
    //   if (_customOp == 0) {
    //     address cdoAddress = _getCDOAddress(_asset);
    //     address stakingAddress = _getTrancheType(_asset) == IDLE_TRANCHE_TYPE_SENIOR ? IIdleCDO(cdoAddress).AAStaking() : IIdleCDO(cdoAddress).BBStaking();
    //     return (_asset, stakingAddress);
    //   } else {
    //     return (address(0), address(0));
    //   }
    // }

    // /**
    //  * (OPTIONAL). Return pre action calldata
    //  *
    //  * hparam _strategy                  Address of the strategy
    //  * hparam  _asset                    Address param
    //  * hparam  _amount                   Amount
    //  * hparam  _customOp                 Type of Custom op
    //  *
    //  * @return address                   Target contract address
    //  * @return uint256                   Call value
    //  * @return bytes                     Trade calldata
    //  */
    // function _getPreActionCallData(
    //     address, /* _strategy */
    //     address _asset,
    //     uint256 _amount,
    //     uint256 _customOp
    // )
    //     internal
    //     view
    //     override
    //     returns (
    //         address,
    //         uint256,
    //         bytes memory
    //     )
    // {
    //   if (_customOp == 1) { // exit
    //     address cdoAddress = _getCDOAddress(_asset);
    //     address stakingAddress = _getTrancheType(_asset) == IDLE_TRANCHE_TYPE_SENIOR ? IIdleCDO(cdoAddress).AAStaking() : IIdleCDO(cdoAddress).BBStaking();

    //     bytes memory methodData = abi.encodeWithSelector(
    //       IIdleCDOTrancheRewards.unstake.selector,
    //       _amount
    //     );

    //     return (stakingAddress, 0, methodData);
    //   } else {
    //     return (address(0), 0, bytes(''));
    //   }
    // }

    // /**
    //  * (OPTIONAL). Whether or not the pre action needs an approval.
    //  * Only makes sense if _getPreActionCallData is filled.
    //  *
    //  * hparam  _asset                     Asset passed as param
    //  * hparam  _tokenDenominator          0 for enter, 1 for exit
    //  * @return address                    Address of the asset to approve
    //  * @return address                    Address to approve
    //  */
    // function _preActionNeedsApproval(
    //     address _asset,
    //     uint8 _customOp
    // ) internal view override returns (address, address) {
    //   if (_customOp == 1) { // exit
    //     address cdoAddress = _getCDOAddress(_asset);
    //     address stakingAddress = _getTrancheType(_asset) == IDLE_TRANCHE_TYPE_SENIOR ? IIdleCDO(cdoAddress).AAStaking() : IIdleCDO(cdoAddress).BBStaking();
    //     return (_asset, stakingAddress);
    //   } else {
    //     return (address(0), address(0));
    //   }
    // }

    /**
     * Return exit custom calldata
     *
     * hparam  _strategy                 Address of the strategy
     * hparam  _data                     OpData e.g. Address of the pool
     * hparam  _resultTokensIn           Amount of result tokens to send
     * hparam  _tokensOut                Addresses of tokens to receive
     * hparam  _minAmountsOut            Amounts of input tokens to receive
     *
     * @return address                   Target contract address
     * @return uint256                   Call value
     * @return bytes                     Trade calldata
     */
    function _getExitCalldata(
        address, /* _strategy */
        bytes calldata _data,
        uint256 _resultTokensIn,
        address[] calldata, /* _tokensOut */
        uint256[] calldata /* _minAmountsOut */
    )
        internal
        view
        override
        returns (
            address,
            uint256,
            bytes memory
        )
    {
        address trancheAddress = BytesLib.decodeOpDataAddressAssembly(_data, 12);
        address cdoAddress = _getCDOAddress(trancheAddress);
        uint trancheType = _getTrancheType(trancheAddress);

        bytes memory methodData;
        if (trancheType == IDLE_TRANCHE_TYPE_JUNIOR) {
          methodData = abi.encodeWithSelector(
            IIdleCDO.withdrawBB.selector,
            _resultTokensIn
          );
        } else if (trancheType == IDLE_TRANCHE_TYPE_SENIOR) {
          methodData = abi.encodeWithSelector(
            IIdleCDO.withdrawAA.selector,
            _resultTokensIn
          );
        }

        return (cdoAddress, 0, methodData);
    }

    /* ============ External Functions ============ */

    /**
     * The tokens to be purchased by the strategy on enter according to the weights.
     * Weights must add up to 1e18 (100%)
     *
     * hparam  _data                      Address provided as param
     * @return _inputTokens               List of input tokens to buy
     * @return _inputWeights              List of weights for the tokens to buy
     */
    function getInputTokensAndWeights(
        bytes calldata _data
    ) external view override returns (address[] memory _inputTokens, uint256[] memory _inputWeights) {
        address trancheAddress = BytesLib.decodeOpDataAddressAssembly(_data, 12);
        address cdoAddress = _getCDOAddress(trancheAddress);
        address[] memory inputTokens = new address[](1);
        inputTokens[0] = IIdleCDO(cdoAddress).token();
        uint256[] memory inputWeights = new uint256[](1);
        inputWeights[0] = 1e18; // 100%
        return (inputTokens, inputWeights);
    }

    /**
     * The tokens to be received on exit.
     *
     * hparam  _strategy                  Strategy address
     * hparam  _data                      Bytes data
     * hparam  _liquidity                 Number with the amount of result tokens to exit
     * @return exitTokens                 List of output tokens to receive on exit
     * @return _minAmountsOut             List of min amounts for the output tokens to receive
     */
    function getOutputTokensAndMinAmountOut(
        address, /* _strategy */
        bytes calldata _data,
        uint256 _liquidity
    ) external view override returns (address[] memory exitTokens, uint256[] memory _minAmountsOut) {
        address trancheAddress = BytesLib.decodeOpDataAddressAssembly(_data, 12);
        address cdoAddress = _getCDOAddress(trancheAddress);
        address[] memory outputTokens = new address[](1);
        outputTokens[0] = IIdleCDO(cdoAddress).token();
        uint256[] memory outputAmounts = new uint256[](1);
        outputAmounts[0] = IIdleCDO(cdoAddress).virtualPrice(trancheAddress).preciseMul(_liquidity);
        return (outputTokens, outputAmounts);
    }

    // /**
    //  * The price of the result token based on the asset received on enter
    //  *
    //  * hparam  _data                      Bytes data
    //  * hparam  _tokenDenominator          Token we receive the capital in
    //  * @return uint256                    Amount of result tokens to receive
    //  */
    function getPriceResultToken(
        bytes calldata _data,
        address _tokenDenominator
    ) external view override returns (uint256) {
        address trancheAddress = BytesLib.decodeOpDataAddressAssembly(_data, 12);
        address cdoAddress = _getCDOAddress(trancheAddress);
        return IIdleCDO(cdoAddress).virtualPrice(trancheAddress).preciseMul(
          _getPrice(IIdleCDO(cdoAddress).token(), _tokenDenominator)
        );
    }

    function _getRewardTokens(address _trancheAddress) internal view override returns (address[] memory) {
      return IIdleCDO(_getCDOAddress(_trancheAddress)).getIncentiveTokens();
    }

    function _getCDOAddress(address _trancheAddress) internal view returns (address) {
      try IIdleCDOTranche(_trancheAddress).minter() returns (address minter) {
        return minter;
      } catch (bytes memory) {
        return address(0);
      }
    }

    function _isValidIdleTranche(address _trancheAddress) internal view returns (bool) {
      try idleCDORegistry.isValidCdo(_getCDOAddress(_trancheAddress)) returns (bool isValid) {
        return isValid;
      } catch (bytes memory) {
        return false;
      }
    }

    function _getTrancheType(address _trancheAddress) internal view returns (uint) {
      address cdoAddress = _getCDOAddress(_trancheAddress);
      if (_trancheAddress == IIdleCDO(cdoAddress).AATranche()) {
        return IDLE_TRANCHE_TYPE_SENIOR;
      } else if (_trancheAddress == IIdleCDO(cdoAddress).BBTranche()) {
        return IDLE_TRANCHE_TYPE_JUNIOR;
      } else {
        revert("invalid tranche type");
      }
    }
}
