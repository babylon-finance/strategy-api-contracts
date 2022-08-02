// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.7.6;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IBabController} from '../../interfaces/IBabController.sol';
import {ICurveMetaRegistry} from '../../interfaces/ICurveMetaRegistry.sol';
import {CustomIntegration} from './CustomIntegration.sol';
import {PreciseUnitMath} from '../../lib/PreciseUnitMath.sol';
import {LowGasSafeMath} from '../../lib/LowGasSafeMath.sol';
import {BytesLib} from '../../lib/BytesLib.sol';
import {ControllerLib} from '../../lib/ControllerLib.sol';
import {IBorrowerOperations} from '../../interfaces/external/liquity/IBorrowerOperations.sol';
import {ITroveManager} from '../../interfaces/external/liquity/ITroveManager.sol';
import {IPriceFeed} from '../../interfaces/external/liquity/IPriceFeed.sol';

/**
 * @title CustomIntegrationLiquity
 * @author adamb
 *
 * Custom integration for Liquity Lend and Borrow LUSD
 */
contract CustomIntegrationLiquity is CustomIntegration {
    // the fee varies between 0.5% and 5% depending on LUSD redemption volumes.
    uint constant LIQUITY_MAX_FEE_PERCENTAGE = 0.05 * 1e18; // 5%

    using LowGasSafeMath for uint256;
    using PreciseUnitMath for uint256;
    using BytesLib for uint256;
    using ControllerLib for IBabController;

    /* ============ State Variables ============ */

    /* Add State variables here if any. Pass to the constructor */
    IBorrowerOperations private immutable liquityBorrowerOperations;
    uint private immutable babylonLiquidationBuffer;

    /* ============ Constructor ============ */

    /**
     * Creates the integration
     *
     * @param _controller                   Address of the controller
     */
    constructor(IBabController _controller, IBorrowerOperations _liquityBorrowerOperations) CustomIntegration('custom_liquity', _controller) {
        require(address(_controller) != address(0), 'invalid address');
        liquityBorrowerOperations = _liquityBorrowerOperations;

        // when creating this custom strategy, don't allow borrowing up
        // to the maximum collateral ratio. ensure that users have at least
        // a 5% buffer.
        babylonLiquidationBuffer = 50000000000000000;
    }

    /* =============== Internal Functions ============== */

    /**
     * Whether or not the data provided is valid
     *
     * hparam  _data                     Data provided
     * @return bool                      True if the data is correct
     */
    function _isValid(bytes memory _data) internal view override returns (bool) {
        (, uint targetCollateralRatio) = abi.decode(_data, (address, uint));

        // ensure that the target collateral ratio is above the minimum
        // expressed with 1e18 decimals of precision, i.e. 1.5 * 1e18
        // for a 150% collateral ratio
        return targetCollateralRatio >= liquityBorrowerOperations.MCR() + babylonLiquidationBuffer;
    }

    /**
     * Which address needs to be approved (IERC-20) for the input tokens.
     *
     * hparam  _data                     Data provided
     * hparam  _opType                   O for enter, 1 for exit
     * @return address                   Address to approve the tokens to
     */
    function _getSpender(
        bytes calldata, /* _data */
        uint8 /* _opType */
    ) internal view override returns (address) {
        return address(liquityBorrowerOperations);
    }

    /**
     * The address of the IERC-20 token obtained after entering this operation
     *
     * hparam  _token                     Address provided as param
     * @return address                    Address of the resulting lp token
     */
    function _getResultToken(address) internal view override returns (address) {
        return liquityBorrowerOperations.lusdToken();
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
        address[] calldata, /* _tokensIn */
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
        (, uint targetCollateralRatio) = abi.decode(_data, (address, uint));
        uint amountLUSDToBorrow = _maxAmountsIn[0].preciseMul(_getEthPrice()).preciseDiv(targetCollateralRatio);

        return (address(liquityBorrowerOperations), _maxAmountsIn[0], abi.encodeWithSelector(
          IBorrowerOperations.openTrove.selector,
          LIQUITY_MAX_FEE_PERCENTAGE, // maxFeePercentage
          amountLUSDToBorrow, // LUSD amount
          address(0), // lowerHint
          address(0) // upperHint
        ));
    }

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
        bytes calldata, /* _data */
        uint256, /* _resultTokensIn */
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
        // calling this function requires us to have the requisite amount of LUSD
        // in the strategy. remember that the amount of LUSD that we owe will be
        // more than the amount that we receieved, as it includes the borrowing fee.
        // we will need to obtain this LUSD from another source before closing the strategy.
        return (address(liquityBorrowerOperations), 0, abi.encodeWithSelector(
          IBorrowerOperations.closeTrove.selector
        ));
    }

    /**
     * The list of addresses of the IERC-20 tokens mined as rewards during the strategy
     *
     * hparam  _data                      Address provided as param
     * @return address[] memory           List of reward token addresses
     */
    function _getRewardTokens(
        address /* _data */
    ) internal pure override returns (address[] memory) {
        // no LQTY rewards for lending or borrowing
        return new address[](0);
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
        bytes calldata /* _data */
    ) external pure override returns (address[] memory _inputTokens, uint256[] memory _inputWeights) {
        address[] memory inputTokens = new address[](1);
        // inputTokens[0] is address(0) (ether)
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
        address _strategy,
        bytes calldata, /* _data */
        uint256 /* _liquidity */
    ) external view override returns (address[] memory exitTokens, uint256[] memory _minAmountsOut) {
        address[] memory outputTokens = new address[](1);
        // outputTokens[0] is address(0) (ether)
        uint256[] memory outputAmounts = new uint256[](1);

        // fees are paid in LUSD, so the output amount when closing the trove will
        // just be the amount of ETH in the trove
        outputAmounts[0] = _getCollateral(_strategy);
        return (outputTokens, outputAmounts);
    }

    /**
     * The price of the result token based on the asset received on enter
     *
     * hparam  _data                      Bytes data
     * hparam  _tokenDenominator          Token we receive the capital in
     * @return uint256                    Amount of result tokens to receive
     */
    function getPriceResultToken(
        bytes calldata, /* _data */
        address _tokenDenominator
    ) external view override returns (uint256) {
      address _strategy = 0xcEd6914a2d641b2aAcBF78dB94648741e5AA870e; // TODO: pass the _strategy once the interface changes
      uint collateralAmountEth = _getCollateral(_strategy);
      uint collateralAmountUsd = collateralAmountEth.preciseMul(_getEthPrice());
      uint debtAmountUsd = _getDebt(_strategy);
      uint pricePerTokenUsd = collateralAmountUsd.add(debtAmountUsd).div(debtAmountUsd);

      return pricePerTokenUsd.preciseMul(
        // convert from USD -> tokenDenominator
        // TODO: use USD here, instead of LUSD? But how would we do that?
        _getPrice(liquityBorrowerOperations.lusdToken(), _tokenDenominator)
      );
    }

    function _getEthPrice() internal view returns (uint) {
      return IPriceFeed(liquityBorrowerOperations.priceFeed()).lastGoodPrice();
    }

    function _getCollateral(address _strategy) internal view returns (uint) {
      return ITroveManager(liquityBorrowerOperations.troveManager()).getTroveColl(_strategy);
    }

    function _getDebt(address _strategy) internal view returns (uint) {
      return ITroveManager(liquityBorrowerOperations.troveManager()).getTroveDebt(_strategy);
    }
}
