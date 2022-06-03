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

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const UniswapV3TradeIntegration = '0xc300FB5dE5384bcA63fb6eb3EfD9DB7dFd10325C';
const NFT_URI = 'https://babylon.mypinata.cloud/ipfs/QmcL826qNckBzEk2P11w4GQrrQFwGvR6XmUCuQgBX9ck1v';
const NFT_SEED = '504592746';

describe('Balancer integration', function () {
  let owner;
  let garden;
  let strategy;
  let controller;
  let keeper;
  let alice;
  let bob;

  before(async () => {
    [, keeper, alice, bob] = await ethers.getSigners();
    controller = await ethers.getContractAt('IBabController', '0xD4a5b5fcB561dAF3aDF86F8477555B92FBa43b5F');
    owner = await impersonateAddress('0x97FcC2Ae862D03143b393e9fA73A32b563d57A6e');
    const validContract = await controller.isValidKeeper(keeper.address);

    if (!validContract) {
      await controller.connect(owner).addKeeper(keeper.address);
    }

    // Creates a garden with custom integrations enabled
    const contribution = eth(1);
    await controller.connect(alice).createGarden(
      WETH,
      'Fountain',
      'FTN',
      NFT_URI,
      NFT_SEED,
      [
        eth(100), // Max Deposit Limit
        1, // Min Liquidity Asset | ie: Uniswap Volume
        1, // Deposit Hardlock | 1 second
        eth(0.1), // Min Contribution
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
      contribution,
      [true, true, true], // publicGardenStrategistsStewards
      [0, 0, 0], // Profit splits. Use defaults
      {
        value: contribution,
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

  it('can enter a strategy with the Balancer custom integration on WETH garden', async () => {
    const poolAddressStablePool = '0x06Df3b2bbB68adc8B0e302443692037ED9f91b42';
    const balToken = await ethers.getContractAt('@balancer-labs/v2-solidity-utils/contracts/openzeppelin/IERC20.sol:IERC20', poolAddressStablePool);

    const customIntegration = await deploy('CustomIntegrationBalancerv2', {
      from: alice.address,
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
        [poolAddressStablePool, 0] // integration params.
      ), // _opEncodedDatas
    );

    const strategies = await garden.getStrategies();
    customStrategy = await ethers.getContractAt('IStrategy', strategies[0]);

    await garden.connect(alice).deposit(eth(10), 0, alice.address, ADDRESS_ZERO, {
      value: eth(10),
    });

    const balance = await garden.balanceOf(alice.getAddress());

    // Vote Strategy
    await customStrategy.connect(keeper).resolveVoting([alice.address], [balance], 0);

    // Execute strategy
    await increaseTime(ONE_DAY_IN_SECONDS);
    await customStrategy.connect(keeper).executeStrategy(eth(10), 0);

    let balBalance = await balToken.balanceOf(customStrategy.address);
    expect(balBalance).to.be.above(0);

    // Finalize strategy
    await increaseTime(ONE_DAY_IN_SECONDS * 30);
    await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);
    balBalance = await balToken.balanceOf(customStrategy.address);

    expect(balBalance).to.be.equals(0);
  });
});
