const { expect } = require('chai');
const { ethers } = require('hardhat');
const addresses = require('../../lib/addresses');
const { getERC20, increaseTime } = require('../utils/test-helpers');
const { ADDRESS_ZERO, ONE_DAY_IN_SECONDS } = require('../../lib/constants');
const { impersonateAddress } = require('../../lib/rpc');
const { eth } = require('../../lib/helpers');
const { deployments } = require('hardhat');
const { assert } = require('console');
const { uniswap } = require('../../lib/addresses');
const { deploy } = deployments;
// const { takeSnapshot, restoreSnapshot } = require('lib/rpc');

const UniswapV3TradeIntegration = '0xc300FB5dE5384bcA63fb6eb3EfD9DB7dFd10325C';
const NFT_URI = 'https://babylon.mypinata.cloud/ipfs/QmcL826qNckBzEk2P11w4GQrrQFwGvR6XmUCuQgBX9ck1v';
const NFT_SEED = '504592746';

describe.only('Balancer integration', function () {
  let owner;
  let garden;
  let controller;
  let keeper;
  let alice;
  let bob;
  let USDC;
  let WETH;
  let usdcHolder;
  let poolAddress;
  let balToken;
  let vault;
  let basePool;
  let usdcGardenBalanceNoSwaps;
  let amountUSDC;
  let assetOut;
  let poolId;
  let protocolFeeContract;
  let poolDetails;

  before(async () => {
    [alice, keeper, bob] = await ethers.getSigners();
    controller = await ethers.getContractAt('IBabController', '0xD4a5b5fcB561dAF3aDF86F8477555B92FBa43b5F');
    owner = await impersonateAddress('0x97FcC2Ae862D03143b393e9fA73A32b563d57A6e');
    const keeperAdded = await controller.isValidKeeper(keeper.address);

    if (!keeperAdded) {
      await controller.connect(owner).addKeeper(keeper.address);
    }

    // Global variables

    poolAddress = '0x96646936b91d6B9D7D0c47C496AfBF3D6ec7B6f8'; // Weighted Pool WETH 50% USDC 50%
    // poolAddress = '0x06Df3b2bbB68adc8B0e302443692037ED9f91b42'; // Stable pool USDC/DAI/USDT

    assetOut = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";// WETH weig
    // assetOut = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT stable


    // Instiating contracts
    USDC = await ethers.getContractAt("@balancer-labs/v2-solidity-utils/contracts/openzeppelin/ERC20.sol:ERC20", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    WETH = await ethers.getContractAt("@balancer-labs/v2-solidity-utils/contracts/openzeppelin/ERC20.sol:ERC20", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    protocolFeeContract = await ethers.getContractAt("IProtocolFeesCollector", "0xce88686553686DA562CE7Cea497CE749DA109f9F");


    balToken = await ethers.getContractAt('@balancer-labs/v2-solidity-utils/contracts/openzeppelin/IERC20.sol:IERC20', poolAddress);
    vault = await ethers.getContractAt("IVault", "0xBA12222222228d8Ba445958a75a0704d566BF2C8");
    basePool = await ethers.getContractAt("BasePool", poolAddress);

    poolId = await basePool.getPoolId();

    //Transfering USDC to alice 
    usdcHolder = await impersonateAddress("0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503");
    wethHolder = await impersonateAddress("0xD292b72e5C787f9F7E092aB7802aDDF76930981F");


    await USDC.connect(usdcHolder).approve(alice.address, eth(400000000000000000));
    await USDC.connect(usdcHolder).transfer(alice.address, 1000000000000);
    await USDC.connect(alice).approve(controller.address, eth(400000000000000000));

    const USDCDecimals = await USDC.decimals();

    amountUSDC = 100000 * (10 ** USDCDecimals);  // 100k usd

    // Creates a garden with custom integrations enabled
    await controller.connect(alice).createGarden(
      USDC.address,
      'Fountain',
      'FTN',
      NFT_URI,
      NFT_SEED,
      [
        eth(1), // Max Deposit Limit
        1, // Min Liquidity Asset | ie: Uniswap Volume
        1, // Deposit Hardlock | 1 second
        amountUSDC, // Min Contribution
        ONE_DAY_IN_SECONDS, // Strategy Cooldown Period
        eth(0.1), // Min Voter Quorum | 10%
        ONE_DAY_IN_SECONDS * 3, // Min Strategy Duration
        ONE_DAY_IN_SECONDS * 365, // Max Strategy Duration
        1, // Min number of voters
        eth(), // Decay rate of price per share
        eth(), // Base slippage for price per share
        1, // Can mint NFT after 1 sec of being a member
        1 // Whether or not the garden has custom integrations enabled
      ],
      amountUSDC,
      [true, true, true], // publicGardenStrategistsStewards
      [0, 0, 0], // Profit splits. Use defaults
      {
        value: amountUSDC // 6 decimals for usdc? 
      },
    );

    const gardens = await controller.getGardens();
    // console.log(`Garden created at ${gardens[0]}`);
    garden = await ethers.getContractAt('IGarden', gardens.slice(-1)[0]);
    // Alternatively you can use mainnet Test WETH garden that has custom integrations enabled
    // garden = await ethers.getContractAt('IGarden', '0x2c4Beb32f0c80309876F028694B4633509e942D4');
  });

  beforeEach(async () => { });

  afterEach(async () => { });

  it('can enter a strategy with the Balancer custom integration on USDC garden', async () => {

    const customIntegration = await deploy('CustomIntegrationBalancerv2', {
      from: bob.address,
      args: [controller.address],
    });

    await garden.connect(alice).addStrategy(
      'Execute my custom integration',
      '💎',
      [
        eth(100), // maxCapitalRequested: eth(10),
        eth(0.1), // stake: eth(0.1),
        ONE_DAY_IN_SECONDS * 30, // strategyDuration: ONE_DAY_IN_SECONDS * 30,
        eth(0.05), // expectedReturn: eth(0.05),
        eth(0.1), // maxAllocationPercentage: eth(0.1),
        eth(0.05), // maxGasFeePercentage: eth(0.05),
        eth(0.09), // maxTradeSlippagePercentage: eth(0.09),
      ],
      [5], // _opTypes
      [customIntegration.address], // _opIntegrations
      new ethers.utils.AbiCoder().encode(
        ['address', 'uint256'],
        [poolAddress, 0] // integration params.
      ), // _opEncodedDatas
    );

    const strategies = await garden.getStrategies();
    customStrategy = await ethers.getContractAt('IStrategy', strategies[0]);

    //Deposint go garden
    await USDC.connect(alice).approve(garden.address, eth(400000000000000000));

    await garden.connect(alice).deposit(amountUSDC, 0, alice.address, ADDRESS_ZERO, {
      value: amountUSDC,
    });


    const balance = await garden.balanceOf(alice.getAddress());

    // Vote Strategy
    await customStrategy.connect(keeper).resolveVoting([alice.address], [balance], 0);

    // Execute strategy

    poolDetails = await vault.getPoolTokens(poolId);
    console.log("Pool balances pre test without swaps", poolDetails[1]);
    await increaseTime(ONE_DAY_IN_SECONDS);
    await customStrategy.connect(keeper).executeStrategy(amountUSDC, 0);

    let balBalance = await balToken.balanceOf(customStrategy.address);
    poolDetails = await vault.getPoolTokens(poolId);
    console.log("Pool balances after entering test without swaps", poolDetails[1]);

    // expect(balBalance).to.be.above(eth(9500));

    // Finalize strategy
    await increaseTime(ONE_DAY_IN_SECONDS * 30);
    await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);
    balBalance = await balToken.balanceOf(customStrategy.address);

    expect(balBalance).to.be.equals(0);

    // All the money gets converted to our reserve asset (USDC)
    usdcGardenBalanceNoSwaps = await USDC.balanceOf(garden.address);


    poolDetails = await vault.getPoolTokens(poolId);
    console.log("Pool balances after exiting test without swaps", poolDetails[1]);


    console.log("usdcGardenBalanceNoSwaps", usdcGardenBalanceNoSwaps);




  });

  it('can enter a strategy with the Balancer and perceive Swap Fees accordingly', async () => {

    // Creates a new garden with custom integrations enabled
    await controller.connect(alice).createGarden(
      USDC.address,
      'Fountain',
      'FTN',
      NFT_URI,
      NFT_SEED,
      [
        eth(1), // Max Deposit Limit
        1, // Min Liquidity Asset | ie: Uniswap Volume
        1, // Deposit Hardlock | 1 second
        amountUSDC, // Min Contribution
        ONE_DAY_IN_SECONDS, // Strategy Cooldown Period
        eth(0.1), // Min Voter Quorum | 10%
        ONE_DAY_IN_SECONDS * 3, // Min Strategy Duration
        ONE_DAY_IN_SECONDS * 365, // Max Strategy Duration
        1, // Min number of voters
        eth(), // Decay rate of price per share
        eth(), // Base slippage for price per share
        1, // Can mint NFT after 1 sec of being a member
        1 // Whether or not the garden has custom integrations enabled
      ],
      amountUSDC,
      [true, true, true], // publicGardenStrategistsStewards
      [0, 0, 0], // Profit splits. Use defaults
      {
        value: amountUSDC // 6 decimals for usdc? 
      },
    );

    const gardens = await controller.getGardens();
    // console.log(`Garden created at ${gardens[0]}`);
    garden = await ethers.getContractAt('IGarden', gardens.slice(-1)[0]);

    const customIntegration = await deploy('CustomIntegrationBalancerv2', {
      from: bob.address,
      args: [controller.address],
    });

    await garden.connect(alice).addStrategy(
      'Execute my custom integration',
      '💎',
      [
        eth(100), // maxCapitalRequested: eth(10),
        eth(0.1), // stake: eth(0.1),
        ONE_DAY_IN_SECONDS * 30, // strategyDuration: ONE_DAY_IN_SECONDS * 30,
        eth(0.05), // expectedReturn: eth(0.05),
        eth(0.1), // maxAllocationPercentage: eth(0.1),
        eth(0.05), // maxGasFeePercentage: eth(0.05),
        eth(0.09), // maxTradeSlippagePercentage: eth(0.09),
      ],
      [5], // _opTypes
      [customIntegration.address], // _opIntegrations
      new ethers.utils.AbiCoder().encode(
        ['address', 'uint256'],
        [poolAddress, 0] // integration params.
      ), // _opEncodedDatas
    );

    const strategies = await garden.getStrategies();
    customStrategy = await ethers.getContractAt('IStrategy', strategies[0]);

    //Deposint go garden
    await USDC.connect(alice).approve(garden.address, eth(400000000000000000));

    await garden.connect(alice).deposit(amountUSDC, 0, alice.address, ADDRESS_ZERO, {
      value: amountUSDC,
    });

    const balance = await garden.balanceOf(alice.getAddress());

    // Vote Strategy
    await customStrategy.connect(keeper).resolveVoting([alice.address], [balance], 0);

    // Execute strategy
    await increaseTime(ONE_DAY_IN_SECONDS);
    await customStrategy.connect(keeper).executeStrategy(amountUSDC, 0);

    let balBalance = await balToken.balanceOf(customStrategy.address);
    // expect(balBalance).to.be.above(eth(9500));


    // Swaping (two swaps to return to starting proportion in order prevent impermanent loss )




    const blockNumber = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumber);

    const totalSupply = await balToken.totalSupply();
    const proportion = balBalance / totalSupply;


    const USDCDecimals = await USDC.decimals();
    let amountToTrade = 1000000 * (10 ** USDCDecimals);  // 1 million usdc 

    const swapFee = await basePool.getSwapFeePercentage();
    const swapFeePercentage = (swapFee) / (eth(1));     // 1x10^18 = 100% 




    const protocolFee = await protocolFeeContract.getSwapFeePercentage();
    const protocolFeePercentage = protocolFee / eth(1);       // 1x10 ^ 18 = 100 % 

    const expectedFeesUSDCWETH = amountToTrade * proportion * swapFeePercentage * protocolFeePercentage;

    console.log("expectedFees USDC to WETH", expectedFeesUSDCWETH);


    let singleSwap = {
      poolId: poolId,
      kind: 0, /* GIVEN_IN */
      assetIn: USDC.address,
      assetOut: WETH.address,
      amount: amountToTrade,
      userData: "0x"
    }

    let funds = {
      sender: usdcHolder.address,
      fromInternalBalance: false,
      recipient: usdcHolder.address,
      toInternalBalance: false

    }


    poolDetails = await vault.getPoolTokens(poolId);
    console.log("Pre pool balances", poolDetails[1]);

    console.log("starting swap 1");

    await USDC.connect(usdcHolder).approve(vault.address, eth(400000000000000000));
    const tx = await vault.connect(usdcHolder).swap(singleSwap, funds, 0, (blockBefore.timestamp + 10));
    await tx.wait(1);

    poolDetails = await vault.getPoolTokens(poolId);
    console.log("Pool balances after swap1", poolDetails[1]);

    console.log("starting swap 2");

    amountToTrade = await WETH.balanceOf(usdcHolder.address);

    console.log("WETH balance swapper", await WETH.balanceOf(usdcHolder.address));

    const expectedFeesWETHUSDC = amountToTrade * proportion * swapFeePercentage * protocolFeePercentage;

    console.log("expectedFees WETH to USDC", expectedFeesWETHUSDC);

    singleSwap = {
      poolId: poolId,
      kind: 0, /* GIVEN_IN */
      assetIn: WETH.address,
      assetOut: USDC.address,
      amount: amountToTrade,
      userData: "0x"
    }

    funds = {
      sender: usdcHolder.address,
      fromInternalBalance: false,
      recipient: usdcHolder.address,
      toInternalBalance: false

    }


    await WETH.connect(usdcHolder).approve(vault.address, eth(400000000000000000));
    const tx2 = await vault.connect(usdcHolder).swap(singleSwap, funds, 0, (blockBefore.timestamp + 10));
    await tx2.wait(1);

    poolDetails = await vault.getPoolTokens(poolId);
    console.log("Pool balances after swap2", poolDetails[1]);





    // Finalize strategy
    await increaseTime(ONE_DAY_IN_SECONDS * 30);
    await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);
    balBalance = await balToken.balanceOf(customStrategy.address);

    expect(balBalance).to.be.equals(0);


    // All the money gets converted to our reserve asset (USDC)
    usdcGardenBalanceWithSwaps = await USDC.balanceOf(garden.address);

    console.log("usdcGardenBalanceWithSwaps", usdcGardenBalanceWithSwaps);


    const realizedProfitFromFees = usdcGardenBalanceWithSwaps - usdcGardenBalanceNoSwaps;

    console.log(realizedProfitFromFees);

    expect(usdcGardenBalanceWithSwaps).to.be.above(usdcGardenBalanceNoSwaps);





    // bl = balBalance                                bl          
    // bs = balTotalSupply       expectedFees =   --------- * as * sF *pf
    // as = amountSwapped                             bs   
    // sf = swapFee%
    // pf = protocolFee % 

    expect(realizedProfitFromFees / (10 ** USDCDecimals)).to.be.closeTo(expectedFeesUSDCWETH / (10 ** USDCDecimals) + expectedFeesWETHUSDC * 1924 / eth(1), 0.05)








  });

  it.skip('Weighted pool WETH/USDC tests', async () => {

    const USDCDecimals = await USDC.decimals();


    //Transfering money to bob

    await WETH.connect(wethHolder).transfer(bob.address, eth(10));   // Sending 10 eth

    await USDC.connect(usdcHolder).transfer(bob.address, 10000 * (10 ** USDCDecimals));   // Sending 10000 USDC


    //Join pool  

    const joinKindInit = 1; /* EXACT_TOKENS_IN_FOR_BPT_OUT */
    const maxAmountsIn = [1924 * (10 ** USDCDecimals), eth(1)];
    // const maxAmountsIn = [1, eth(1)];
    const minimumBPT = 0;
    // const assetsJoin = [await ethers.getContractAt("IAsset", WETH.address), await ethers.getContractAt("IAsset", USDC.address)];

    const assetsJoin = [USDC.address, WETH.address];




    const userDataJoin = new ethers.utils.AbiCoder().encode(
      ['uint256', 'uint256[]', 'uint256'],
      [joinKindInit, maxAmountsIn, minimumBPT]);



    const joinPoolRequest = {
      assets: assetsJoin,
      maxAmountsIn: maxAmountsIn,
      userData: userDataJoin,
      fromInternalBalance: false
    }


    console.log("WETH balance pre join", await WETH.balanceOf(bob.address));
    console.log("USDC balance pre join", await USDC.balanceOf(bob.address));


    await USDC.connect(bob).approve(vault.address, eth(400000000000000000));
    await WETH.connect(bob).approve(vault.address, eth(400000000000000000));


    await vault.connect(bob).joinPool(poolId, bob.address, bob.address, joinPoolRequest);

    console.log("Joined Pool");

    const balBalance = await balToken.balanceOf(bob.address);

    console.log("BPT adquired", await balToken.balanceOf(bob.address))

    console.log("WETH balance post join", await WETH.balanceOf(bob.address));
    console.log("USDC balance post join", await USDC.balanceOf(bob.address));


    // Swaping (two swaps to return to starting proportion in order prevent impermanent loss )

    const swapFee = await basePool.getSwapFeePercentage();

    const protocolFee = await protocolFeeContract.getSwapFeePercentage();
    console.log("swapFee", swapFee);


    const blockNumber = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumber);

    const totalSupply = await balToken.totalSupply();
    const proportion = balBalance / totalSupply;
    const swapFeePercentage = (swapFee) / (eth(1));            // 1x10^18 = 100% 

    const protocolFeePercentage = protocolFee / eth(1);       // 1x10 ^ 18 = 100 % 



    let amountToTrade = 1000000 * (10 ** USDCDecimals);        // 1 million usdc 


    console.log("expectedFees USDC to WETH", amountToTrade * proportion * swapFeePercentage * protocolFeePercentage);

    console.log("expectedFees USDC to WETH TOTAL", amountToTrade * swapFeePercentage * protocolFeePercentage);



    let singleSwap = {
      poolId: poolId,
      kind: 0, /* GIVEN_IN */
      assetIn: USDC.address,
      assetOut: WETH.address,
      amount: amountToTrade,
      userData: "0x"
    }

    let funds = {
      sender: usdcHolder.address,
      fromInternalBalance: false,
      recipient: usdcHolder.address,
      toInternalBalance: false

    }


    poolDetails = await vault.getPoolTokens(poolId);
    console.log("Pre pool balances", poolDetails[1]);

    console.log("starting swap 1");

    await USDC.connect(usdcHolder).approve(vault.address, eth(400000000000000000));
    const tx = await vault.connect(usdcHolder).swap(singleSwap, funds, 0, (blockBefore.timestamp + 10));
    await tx.wait(1);

    poolDetails = await vault.getPoolTokens(poolId);
    console.log("Pool balances after swap1", poolDetails[1]);

    console.log("starting swap 2");

    amountToTrade = await WETH.balanceOf(usdcHolder.address);

    console.log("WETH balance swapper", await WETH.balanceOf(usdcHolder.address));


    console.log("expectedFees WETH to USDC", amountToTrade * proportion * swapFeePercentage * protocolFeePercentage);
    console.log("expectedFees WETH to USDC TOTAL", amountToTrade * swapFeePercentage * protocolFeePercentage);

    singleSwap = {
      poolId: poolId,
      kind: 0, /* GIVEN_IN */
      assetIn: WETH.address,
      assetOut: USDC.address,
      amount: amountToTrade,
      userData: "0x"
    }

    funds = {
      sender: usdcHolder.address,
      fromInternalBalance: false,
      recipient: usdcHolder.address,
      toInternalBalance: false

    }


    await WETH.connect(usdcHolder).approve(vault.address, eth(400000000000000000));
    const tx2 = await vault.connect(usdcHolder).swap(singleSwap, funds, 0, (blockBefore.timestamp + 10));
    await tx2.wait(1);

    poolDetails = await vault.getPoolTokens(poolId);
    console.log("Pool balances after swap2", poolDetails[1]);



    // Exit pool

    const amountsOut = [0, 0];
    const BPTIn = balBalance;
    const assetsExit = [USDC.address, WETH.address];
    const exitKindInit = 1; /* EXACT_TOKENS_IN_FOR_BPT_OUT */

    const userDataExit = new ethers.utils.AbiCoder().encode(
      ['uint256', 'uint256'],
      [exitKindInit, BPTIn]);



    const exitPoolRequest = {
      assets: assetsExit,
      minAmountsOut: amountsOut,
      userData: userDataExit,
      toInternalBalance: false
    }

    await vault.connect(bob).exitPool(poolId, bob.address, bob.address, exitPoolRequest);


    console.log("WETH balance post exit", await WETH.balanceOf(bob.address));
    console.log("USDC balance post exit", await USDC.balanceOf(bob.address));






  });

});
