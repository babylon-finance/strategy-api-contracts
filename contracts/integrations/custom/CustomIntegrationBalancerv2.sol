// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import {IAsset} from '@balancer-labs/v2-vault/contracts/interfaces/IAsset.sol';
import {BasePool} from '@balancer-labs/v2-pool-utils/contracts/BasePool.sol';
import {IERC20} from '@balancer-labs/v2-solidity-utils/contracts/openzeppelin/IERC20.sol';
import {ERC20} from '@balancer-labs/v2-solidity-utils/contracts/openzeppelin/ERC20.sol';
import {IVault} from '@balancer-labs/v2-vault/contracts/interfaces/IVault.sol';
import {WeightedMath} from '@balancer-labs/v2-pool-weighted/contracts/WeightedMath.sol';

import {IBabController} from '../../interfaces/IBabController.sol';
import {CustomIntegration} from './CustomIntegration.sol';
import {PreciseUnitMath} from '../../lib/PreciseUnitMath.sol';
import {LowGasSafeMath} from '../../lib/LowGasSafeMath.sol';
import {BytesLib} from '../../lib/BytesLib.sol';
import {ControllerLib} from '../../lib/ControllerLib.sol';

/**
 * @title Custom integration for the Balancer V2 protocol
 * @author ChrisiPK, MartelAxe
 *
 * This integration allows Babylon Finance gardens to provide liquidity to Balancer V2 pools.
 */
contract CustomIntegrationBalancerv2 is CustomIntegration, WeightedMath {
    using LowGasSafeMath for uint256;

    /* ============ State Variables ============ */

    address private constant vaultAddress = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

    /* ============ Constructor ============ */

    /**
     * Creates the integration
     *
     * @param _controller                   Address of the controller
     */
    constructor(IBabController _controller) CustomIntegration('custom_balancerv2', _controller) {
        require(address(_controller) != address(0), 'invalid address');
    }

    /* =============== Internal Functions ============== */

    /**
     * Whether or not the data provided is valid. Checks if the supplied address is a Balancer V2 pool contract
     * and the pool is not empty.
     *
     * @param  _data                     Data provided
     * @return bool                      True if the data is correct
     */
    function _isValid(bytes memory _data) internal view override returns (bool) {
        BasePool pool = BasePool(BytesLib.decodeOpDataAddressAssembly(_data, 12));

        if (address(pool.getVault()) != vaultAddress) {
            return false;
        }

        IVault vault = IVault(vaultAddress);
        bytes32 poolId = pool.getPoolId();

        (, uint256[] memory balances, ) = vault.getPoolTokens(poolId);
        uint256 balanceSum;
        for (uint8 i = 0; i < balances.length; ++i) {
            balanceSum += balances[i];
        }

        // We cannot enter empty pools because we rely on the balances
        // to find our input weights
        if (balanceSum == 0) {
            return false;
        }

        return true;
    }

    /**
     * Which address needs to be approved (IERC-20) for the input tokens.
     * Always returns the vault address.
     *
     * hparam  _data                     Data provided
     * hparam  _opType                   O for enter, 1 for exit
     * @return address                   Address to approve the tokens to
     */
    function _getSpender(
        bytes calldata, /*_data*/
        uint8 /* _opType */
    ) internal pure override returns (address) {
        return vaultAddress;
    }

    /**
     * The address of the IERC-20 token obtained after entering this operation.
     * Returns the address of the Balancer pool as each pool is its own token contract.
     *
     * @param  _token                     Address provided as param
     * @return address                    Address of the resulting lp token
     */
    function _getResultToken(address _token) internal pure override returns (address) {
        return _token;
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
        address _strategy,
        bytes calldata _data,
        uint256 _resultTokensOut,
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
        bytes32 poolId = BasePool(BytesLib.decodeOpDataAddress(_data)).getPoolId();
        address strategy = _strategy;
        uint256 resultTokensOut = _resultTokensOut;

        (IERC20[] memory poolTokens, , ) = IVault(vaultAddress).getPoolTokens(poolId);
        require(_tokensIn.length == poolTokens.length, 'Must supply same number of tokens as are already in the pool!');

        IVault.JoinPoolRequest memory joinRequest = _getJoinRequest(
            _tokensIn,
            poolTokens,
            _maxAmountsIn,
            resultTokensOut
        );
        bytes memory methodData = abi.encodeWithSelector(
            IVault.joinPool.selector,
            poolId,
            strategy,
            strategy,
            joinRequest
        );

        return (vaultAddress, 0, methodData);
    }

    /**
     * Return exit custom calldata
     *
     * @param  _strategy                 Address of the strategy
     * @param  _data                     OpData e.g. Address of the pool
     * @param  _resultTokensIn           Amount of result tokens to send
     * @param  _tokensOut                Addresses of tokens to receive
     * @param  _minAmountsOut            Amounts of input tokens to receive
     *
     * @return address                   Target contract address
     * @return uint256                   Call value
     * @return bytes                     Trade calldata
     */
    function _getExitCalldata(
        address _strategy,
        bytes calldata _data,
        uint256 _resultTokensIn,
        address[] calldata _tokensOut,
        uint256[] calldata _minAmountsOut
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
        bytes32 poolId = BasePool(BytesLib.decodeOpDataAddress(_data)).getPoolId();
        address strategy = _strategy;
        uint256 resultTokensIn = _resultTokensIn;

        (IERC20[] memory tokens, , ) = IVault(vaultAddress).getPoolTokens(poolId);
        require(_tokensOut.length == tokens.length, 'Must supply same number of tokens as are already in the pool!');

        IVault.ExitPoolRequest memory exitRequest = _getExitRequest(_tokensOut, tokens, _minAmountsOut, resultTokensIn);
        bytes memory methodData = abi.encodeWithSelector(
            IVault.exitPool.selector,
            poolId,
            strategy,
            strategy,
            exitRequest
        );

        return (vaultAddress, 0, methodData);
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
        // No extra rewards.
        return new address[](1);
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
    function getInputTokensAndWeights(bytes calldata _data)
        external
        view
        override
        returns (address[] memory _inputTokens, uint256[] memory _inputWeights)
    {
        BasePool pool = BasePool(BytesLib.decodeOpDataAddressAssembly(_data, 12));
        IVault vault = IVault(vaultAddress);
        bytes32 poolId = pool.getPoolId();

        (IERC20[] memory poolTokens, uint256[] memory balances, ) = vault.getPoolTokens(poolId);

        uint256 tokenBalanceTotal;
        _inputWeights = new uint256[](poolTokens.length);
        _inputTokens = new address[](poolTokens.length);

        for (uint8 i = 0; i < poolTokens.length; ++i) {
            tokenBalanceTotal += _getBalanceFullDecimals(balances[i], poolTokens[i]).mul(
                _getPrice(address(poolTokens[i]), WETH)
            );
        }

        require(tokenBalanceTotal > 0, 'Balance of all tokens in WETH cannot be zero!');

        for (uint8 i = 0; i < poolTokens.length; ++i) {
            _inputTokens[i] = address(poolTokens[i]);
            _inputWeights[i] = (_getBalanceFullDecimals(balances[i], poolTokens[i]).mul(10**18))
                .mul(_getPrice(address(poolTokens[i]), WETH))
                .div(tokenBalanceTotal);
        }

        return (_inputTokens, _inputWeights);
    }

    /**
     * The tokens to be received on exit.
     *
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
        BasePool pool = BasePool(BytesLib.decodeOpDataAddressAssembly(_data, 12));
        IVault vault = IVault(vaultAddress);
        bytes32 poolId = pool.getPoolId();
        IERC20 bpt = IERC20(BytesLib.decodeOpDataAddressAssembly(_data, 12));

        (IERC20[] memory tokens, uint256[] memory balances, ) = vault.getPoolTokens(poolId);

        uint256[] memory amountsOut = WeightedMath._calcTokensOutGivenExactBptIn(
            balances,
            _liquidity,
            bpt.totalSupply()
        );

        uint256[] memory amountsOutSlippage = new uint256[](amountsOut.length);

        exitTokens = new address[](tokens.length);
        for (uint256 i = 0; i < tokens.length; ++i) {
            exitTokens[i] = address(tokens[i]);
            amountsOutSlippage[i] = amountsOut[i].mul(uint256(10**18).sub(SLIPPAGE_ALLOWED)).div(10**18);
        }

        return (exitTokens, amountsOutSlippage);
    }

    /**
     * The price of the result token based on the asset received on enter
     *
     * hparam  _data                      Bytes data
     * hparam  _tokenDenominator          Token we receive the capital in
     * @return uint256                    Amount of result tokens to receive
     */
    function getPriceResultToken(bytes calldata _data, address _tokenDenominator)
        external
        view
        override
        returns (uint256)
    {
        BasePool pool = BasePool(BytesLib.decodeOpDataAddressAssembly(_data, 12));
        IVault vault = IVault(vaultAddress);
        ERC20 denomToken = ERC20(_tokenDenominator);
        bytes32 poolId = pool.getPoolId();

        (IERC20[] memory poolTokens, uint256[] memory balances, ) = vault.getPoolTokens(poolId);

        uint256 sumTokensInDenominator;
        for (uint256 i = 0; i < poolTokens.length; ++i) {
            uint256 tokenInDenominator = balances[i]
                .mul(_getPrice(address(poolTokens[i]), address(denomToken)))
                .mul(10**denomToken.decimals())
                .div(10**18)
                .div(
                    // multiply with decimals of the denominator token and divide by 10**18 because
                    // the price oracle will always give us 18 decimals
                    10**ERC20(address(poolTokens[i])).decimals()
                );
            sumTokensInDenominator = sumTokensInDenominator.add(tokenInDenominator);
        }

        ERC20 balToken = ERC20(address(pool));

        // We need to make sure that tokens with different decimals work fine with each other.
        // What we get from the calculation is
        // (balToken * balDecimals) / (denomToken * denomDecimals)
        // so we multiply with denomDecimals * (denomDecimals / balDecimals) to get
        // balToken/denomToken  * (balDecimals / denomDecimals) * denomDecimals * (denomDecimals / balDecimals)
        // and in the end we will have
        // balToken/denomToken * denomDecimals
        uint256 price = balToken
            .totalSupply()
            .mul(10**denomToken.decimals())
            .mul(10**denomToken.decimals())
            .div(sumTokensInDenominator)
            .div(10**balToken.decimals()); // balToken * balDecimals // * denomDecimals // * denomDecimals // / denomTokens / denomDecimals) // / balDecimals

        // add price slippage
        uint256 priceWithSlippage = price.mul(uint256(10**18).sub(SLIPPAGE_ALLOWED)).div(10**18);

        // Babylon expects the result to always have 18 decimals, regardless of the decimals of denominator token
        uint256 priceWithSlippageFullDecimals = _getBalanceFullDecimals(priceWithSlippage, denomToken);

        return priceWithSlippageFullDecimals;
    }

    /* ============ Private Functions ============ */

    function _getBalanceFullDecimals(uint256 _balance, IERC20 _token) private view returns (uint256) {
        ERC20 tokenMetadata = ERC20(address(_token));
        return _balance.mul(10**(18 - tokenMetadata.decimals()));
    }

    function _getJoinRequest(
        address[] calldata _tokensIn,
        IERC20[] memory _poolTokens,
        uint256[] calldata _maxAmountsIn,
        uint256 _resultTokensOut
    ) private pure returns (IVault.JoinPoolRequest memory joinRequest) {
        joinRequest.maxAmountsIn = new uint256[](_tokensIn.length);
        joinRequest.assets = new IAsset[](_poolTokens.length);

        for (uint8 i = 0; i < _poolTokens.length; ++i) {
            require(_tokensIn[i] == address(_poolTokens[i]), 'Tokens not supplied in pool order!');
            joinRequest.assets[i] = IAsset(address(_poolTokens[i]));
            joinRequest.maxAmountsIn[i] = _maxAmountsIn[i];
        }

        joinRequest.userData = abi.encode(
            uint256(1), /* EXACT_TOKENS_IN_FOR_BPT_OUT */
            joinRequest.maxAmountsIn,
            _resultTokensOut /* minimum BPT amount */
        );

        return joinRequest;
    }

    function _getExitRequest(
        address[] calldata _tokensIn,
        IERC20[] memory _poolTokens,
        uint256[] calldata _minAmountsOut,
        uint256 _resultTokensIn
    ) private pure returns (IVault.ExitPoolRequest memory exitRequest) {
        exitRequest.minAmountsOut = new uint256[](_tokensIn.length);
        exitRequest.assets = new IAsset[](_poolTokens.length);

        for (uint8 i = 0; i < _poolTokens.length; ++i) {
            require(_tokensIn[i] == address(_poolTokens[i]), 'Tokens not supplied in pool order!');
            exitRequest.assets[i] = IAsset(address(_poolTokens[i]));
            exitRequest.minAmountsOut[i] = _minAmountsOut[i];
        }

        exitRequest.userData = abi.encode(
            uint256(1), /* EXACT_BPT_IN_FOR_TOKENS_OUT */
            _resultTokensIn /* bptAmountIn */
        );

        return exitRequest;
    }
}
