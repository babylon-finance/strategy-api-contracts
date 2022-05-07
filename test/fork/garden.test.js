const { expect } = require('chai');
const { ethers } = require('hardhat');

// const { deployments } = require('hardhat');
const addresses = require('../../lib/addresses');
const { getERC20, increaseTime } = require('../utils/test-helpers');
// const { deploy } = deployments;
const { ADDRESS_ZERO, ONE_DAY_IN_SECONDS } = require('../../lib/constants');

const { impersonateAddress } = require('../../lib/rpc');
// const { takeSnapshot, restoreSnapshot } = require('lib/rpc');
const { eth } = require('../../lib/helpers');
// const { getContracts, deployFixture } = require('lib/deploy');

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const UniswapV3TradeIntegration = '0xc300FB5dE5384bcA63fb6eb3EfD9DB7dFd10325C';
const NFT_URI = 'https://babylon.mypinata.cloud/ipfs/QmcL826qNckBzEk2P11w4GQrrQFwGvR6XmUCuQgBX9ck1v';
const NFT_SEED = '504592746';

describe('babylon', function () {
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
    const owner = await impersonateAddress('0x97FcC2Ae862D03143b393e9fA73A32b563d57A6e');
    await controller.connect(owner).addKeeper(keeper.address);
  });

  beforeEach(async () => {});

  afterEach(async () => {});

  it('can create a garden', async () => {
    const contribution = eth(1);

    await controller.connect(alice).createGarden(
      WETH,
      'Fountain',
      'FTN',
      NFT_URI,
      NFT_SEED,
      [
        eth(100), // Max Deposit Limit
        eth(100), // Min Liquidity Asset | ie: Uniswap Volume
        1, // Deposit Hardlock | 1 second
        eth(0.1), // Min Contribution
        ONE_DAY_IN_SECONDS, // Strategy Cooldown Period
        eth(0.1), // Min Voter Quorum | 10%
        ONE_DAY_IN_SECONDS * 3, // Min Strategy Duration
        ONE_DAY_IN_SECONDS * 365, // Max Strategy Duration
        1, // Min number of voters
        eth(), // Decay rate of price per share
        eth(), // Base slippage for price per share
        1,
      ],
      contribution,
      [true, true, true], // publicGardenStrategistsStewards
      [0, 0, 0],
      {
        value: contribution,
      },
    );

    const gardens = await controller.getGardens();
    // console.log(`Garden created at ${gardens[0]}`);
    garden = await ethers.getContractAt('IGarden', gardens.slice(-1)[0]);
  });

  it('can create a strategy', async () => {
    await garden.connect(alice).addStrategy(
      'Hold DAI',
      '💎',
      [
        eth(10), // maxCapitalRequested: eth(10),
        eth(0.1), // stake: eth(0.1),
        ONE_DAY_IN_SECONDS * 30, // strategyDuration: ONE_DAY_IN_SECONDS * 30,
        eth(0.05), // expectedReturn: eth(0.05),
        eth(0.1), // maxAllocationPercentage: eth(0.1),
        eth(0.05), // maxGasFeePercentage: eth(0.05),
        eth(0.09), // maxTradeSlippagePercentage: eth(0.09),
      ],
      [0], // _opTypes
      [UniswapV3TradeIntegration], // _opIntegrations
      new ethers.utils.AbiCoder().encode(['address', 'uint256'], [addresses.tokens.DAI, 0]), // _opEncodedDatas
    );

    const strategies = await garden.getStrategies();
    // console.log(`Strategy created at ${strategies[0]}`);
    strategy = await ethers.getContractAt('IStrategy', strategies[0]);
  });

  it('can deposit to a garden', async () => {
    await garden.connect(alice).deposit(eth(1), 0, alice.address, ADDRESS_ZERO, {
      value: eth(1),
    });
  });

  it('can vote for a strategy', async () => {
    const balance = await garden.balanceOf(alice.getAddress());
    return strategy.connect(keeper).resolveVoting([alice.address], [balance], 0);
  });

  it('can execute a strategy', async () => {
    await increaseTime(ONE_DAY_IN_SECONDS);
    await strategy.connect(keeper).executeStrategy(eth(1), 0);
  });

  it('can finalize a strategy', async () => {
    await increaseTime(ONE_DAY_IN_SECONDS * 30);
    await strategy.connect(keeper).finalizeStrategy(0, '', 0);
  });

  it('can withdraw from  a garden', async () => {
    await garden.connect(alice).withdraw(eth(), 0, alice.address, false, ADDRESS_ZERO);
  });
});
