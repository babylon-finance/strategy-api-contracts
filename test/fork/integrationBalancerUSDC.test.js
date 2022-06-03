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

  before(async () => {
    [, keeper, bob] = await ethers.getSigners();
    controller = await ethers.getContractAt('IBabController', '0xD4a5b5fcB561dAF3aDF86F8477555B92FBa43b5F');
    owner = await impersonateAddress('0x97FcC2Ae862D03143b393e9fA73A32b563d57A6e');
    const validContract = await controller.isValidKeeper(keeper.address);

    USDC = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");



    if (!validContract) {
      await controller.connect(owner).addKeeper(keeper.address);
    }

    alice = await impersonateAddress("0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503");

    await USDC.connect(alice).approve(controller.address, eth(400000000000000000));

    console.log(await USDC.balanceOf(alice.address));

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
        10000000000, // Min Contribution
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
      10000000000,
      [true, true, true], // publicGardenStrategistsStewards
      [0, 0, 0], // Profit splits. Use defaults
      {
        value: 10000000000 // 6 decimals for usdc? 
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
    const poolAddressStablePool = '0x06Df3b2bbB68adc8B0e302443692037ED9f91b42';
    const balToken = await ethers.getContractAt('@balancer-labs/v2-solidity-utils/contracts/openzeppelin/IERC20.sol:IERC20', poolAddressStablePool);


    console.log("test");
    const customIntegration = await deploy('CustomIntegrationBalancerv2', {
      from: bob.address,
      args: [controller.address],
    });

    console.log("deployed contract");

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
        [poolAddressStablePool, 0] // integration params.
      ), // _opEncodedDatas
    );

    console.log("added strategy");

    const strategies = await garden.getStrategies();
    customStrategy = await ethers.getContractAt('IStrategy', strategies[0]);


    await USDC.connect(alice).approve(garden.address, eth(400000000000000000));

    console.log(await USDC.balanceOf(alice.address));

    await garden.connect(alice).deposit(10000000000, 0, alice.address, ADDRESS_ZERO, {
      value: 10000000000,
    });

    console.log("deposited contract");



    const balance = await garden.balanceOf(alice.getAddress());

    // Vote Strategy
    await customStrategy.connect(keeper).resolveVoting([alice.address], [balance], 0);

    // Execute strategy
    await increaseTime(ONE_DAY_IN_SECONDS);
    await customStrategy.connect(keeper).executeStrategy(10000000000, 0);

    let balBalance = await balToken.balanceOf(customStrategy.address);
    expect(balBalance).to.be.above(eth(9500));

    // Finalize strategy
    await increaseTime(ONE_DAY_IN_SECONDS * 30);
    await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);
    balBalance = await balToken.balanceOf(customStrategy.address);

    expect(balBalance).to.be.equals(0);
  });
});
