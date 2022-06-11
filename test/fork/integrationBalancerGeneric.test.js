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

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const NFT_URI = 'https://babylon.mypinata.cloud/ipfs/QmcL826qNckBzEk2P11w4GQrrQFwGvR6XmUCuQgBX9ck1v';
const NFT_SEED = '504592746';

const BALANCER_POOLS = {
  "USDC-DAI-USDT Stable Pool": {
    poolAddress: '0x06Df3b2bbB68adc8B0e302443692037ED9f91b42',
  },
  "USDC-WETH Weighted Pool": {
    poolAddress: '0x96646936b91d6B9D7D0c47C496AfBF3D6ec7B6f8',
  },
}

describe('Balancer integration', function () {
  before(async () => {
    [, keeper, alice, bob] = await ethers.getSigners();
    controller = await ethers.getContractAt('IBabController', '0xD4a5b5fcB561dAF3aDF86F8477555B92FBa43b5F');
    owner = await impersonateAddress('0x97FcC2Ae862D03143b393e9fA73A32b563d57A6e');
    const keeperAdded = await controller.isValidKeeper(keeper.address);

    if (!keeperAdded) {
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

  for (const [poolName, data] of Object.entries(BALANCER_POOLS)) {
    it(`can deploy a strategy with the Balancer V2 integration: ${poolName}`, async function () {
      const vault = await ethers.getContractAt("IVault", "0xBA12222222228d8Ba445958a75a0704d566BF2C8");
      const basePool = await ethers.getContractAt("BasePool", data.poolAddress);
      const poolId = await basePool.getPoolId();
      const bptToken = await ethers.getContractAt('@balancer-labs/v2-solidity-utils/contracts/openzeppelin/IERC20.sol:IERC20', data.poolAddress);

      const customIntegration = await deploy('CustomIntegrationBalancerv2', {
        from: bob.address,
        args: [controller.address],
      });

      await garden.connect(alice).addStrategy(
        'Execute my custom integration',
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
        [5], // _opTypes
        [customIntegration.address], // _opIntegrations
        new ethers.utils.AbiCoder().encode(
          ['address', 'uint256'],
          [data.poolAddress, 0] // integration params.
        ), // _opEncodedDatas
      );

      const strategies = await garden.getStrategies();
      customStrategy = await ethers.getContractAt('IStrategy', strategies[0]);

      await garden.connect(alice).deposit(eth(1), 0, alice.address, ADDRESS_ZERO, {
        value: eth(1),
      });

      const balance = await garden.balanceOf(alice.getAddress());

      // Vote Strategy
      await customStrategy.connect(keeper).resolveVoting([alice.address], [balance], 0);

      // Execute strategy
      await increaseTime(ONE_DAY_IN_SECONDS);
      await customStrategy.connect(keeper).executeStrategy(eth(1), 0);

      // check that we received BPT tokens
      let bptBalance = await bptToken.balanceOf(customStrategy.address);
      expect(bptBalance).to.be.above(0);

      // check that all input tokens were consumed
      const poolTokens = await vault.getPoolTokens(poolId);
      for (tokenAddress of poolTokens.tokens) {
        const token = await ethers.getContractAt("@balancer-labs/v2-solidity-utils/contracts/openzeppelin/ERC20.sol:ERC20", tokenAddress);
        const tokenBalance = await token.balanceOf(customStrategy.address);
        expect(tokenBalance).to.be.within(0, 10, `Token ${tokenAddress} was not consumed, balance left: ${tokenBalance}`);
      }

      // Finalize strategy
      await increaseTime(ONE_DAY_IN_SECONDS * 30);
      await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);

      // check that all BPT tokens were consumed
      bptBalance = await bptToken.balanceOf(customStrategy.address);
      expect(bptBalance).to.be.equals(0);
    });
  }
});