const { expect } = require('chai');
const { ethers } = require('hardhat');
const { getERC20, increaseTime, getHolderForTokenAddress, getTokenName, getTokenAddress, getHolderForToken } = require('../utils/test-helpers');
const { ADDRESS_ZERO, ONE_DAY_IN_SECONDS } = require('../../lib/constants');
const { impersonateAddress } = require('../../lib/rpc');
const { eth } = require('../../lib/helpers');
const { deployments } = require('hardhat');
const { deploy } = deployments;

const WETH = getTokenAddress('WETH');
const NFT_URI = 'https://babylon.mypinata.cloud/ipfs/QmcL826qNckBzEk2P11w4GQrrQFwGvR6XmUCuQgBX9ck1v';
const NFT_SEED = '504592746';

const BALANCER_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';

let weightedPool3Token;

const BALANCER_POOLS = {
  'USDC-DAI-USDT StablePool': {
    poolAddress: '0x06Df3b2bbB68adc8B0e302443692037ED9f91b42',
  },
  'USDC-WETH WeightedPool2Token': {
    poolAddress: '0x96646936b91d6B9D7D0c47C496AfBF3D6ec7B6f8',
  },
  'wstETH-ETH MetaStablePool': {
    poolAddress: '0x32296969ef14eb0c6d29669c550d4a0449130230',
  },
  'wBTC-BADGER WeightedPool': {
    poolAddress: '0xb460DAa847c45f1C4a41cb05BFB3b51c92e41B36',
  },
  'AAVE-WETH-USDT WeightedPool': {
    poolAddress: () => weightedPool3Token, // variable will be set by before() task
  },
}

// Defines the swap amounts for different tokens.
// These values are without decimals.
const BALANCER_SWAP_AMOUNTS = {
  default: 1000000,
  wstETH: 1000,
  WBTC: 10,
  AAVE: 1000,
  WETH: 50,
}


describe('Balancer V2 integration', function () {
  let keeper, alice, bob, garden, controller, owner, wethToken;

  // Gets the amount of tokens to swap when testing a balancer pool.
  async function getSwapAmount(erc20Token) {
    const tokenName = getTokenName(erc20Token.address);

    let amountWithoutDecimals;
    if (tokenName in BALANCER_SWAP_AMOUNTS) {
      amountWithoutDecimals = BALANCER_SWAP_AMOUNTS[tokenName];
    } else {
      amountWithoutDecimals = BALANCER_SWAP_AMOUNTS.default;
    }

    const decimals = await erc20Token.decimals();
    const swapAmount = ethers.BigNumber.from(amountWithoutDecimals).mul(ethers.BigNumber.from(10).pow(decimals));
    return swapAmount;
  }

  // Creates a new weighted pool with three tokens
  async function createPool() {
    const WEIGHTED_POOL_FACTORY = '0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9';
  
    const NAME = 'Three-token Test Pool';
    const SYMBOL = '60AAVE-15WETH-25USDT';
    const swapFeePercentage = eth(0.005); // 0.5%
    const weights = [eth(0.6), eth(0.15), eth(0.25)];
    const tokens = [getTokenAddress('AAVE'), getTokenAddress('WETH'), getTokenAddress('USDT')];
  
    const factory = await ethers.getContractAt('IWeightedPoolFactory', WEIGHTED_POOL_FACTORY);
  
    const tx = await factory.create(NAME, SYMBOL, tokens, weights, swapFeePercentage, ADDRESS_ZERO);
    const rc = await tx.wait();
  
    const events = rc.events.filter((e) => e.topics[0] === '0x83a48fbcfc991335314e74d0496aab6a1987e992ddc85dddbcc4d6dd6ef2e9fc') // CreatePool
    const str = events[0].topics[1].toString();
    const address = str.slice(0, 2) + str.slice(26, str.length);
  
    return address;
  }
  
  async function joinPool(bob) {
    const aaveHolder = await impersonateAddress(getHolderForToken('AAVE'));
    const usdtHolder = await impersonateAddress(getHolderForToken('USDT'));
    const wethHolder = await impersonateAddress(getHolderForToken('WETH'));
  
    const AAVE = await getERC20(getTokenAddress('AAVE'));
    const USDT = await getERC20(getTokenAddress('USDT'));
    const WETH = await getERC20(getTokenAddress('WETH'));
  
    const basePool = await ethers.getContractAt("BasePool", weightedPool3Token);
    const poolId = await basePool.getPoolId();
  
    // Transferring to bob
    const usdtAmount = ethers.BigNumber.from(1000000).mul(ethers.BigNumber.from(10).pow(6));
    await AAVE.connect(aaveHolder).transfer(bob.address, eth(30000));
    await WETH.connect(wethHolder).transfer(bob.address, eth(300));
    await USDT.connect(usdtHolder).transfer(bob.address, usdtAmount);
  
    // Join pool
    const joinKindInit = 0; /* INIT */
    const maxAmountsIn = [eth(30000), eth(300), usdtAmount];
    const minimumBPT = 0;
  
    const assetsJoin = [AAVE.address, WETH.address, USDT.address];
  
    const userDataJoin = new ethers.utils.AbiCoder().encode(
      ['uint256', 'uint256[]', 'uint256'],
      [joinKindInit, maxAmountsIn, minimumBPT]);
  
    const joinPoolRequest = {
      assets: assetsJoin,
      maxAmountsIn: maxAmountsIn,
      userData: userDataJoin,
      fromInternalBalance: false
    }
  
    const vault = await ethers.getContractAt("IVault", BALANCER_VAULT);
    await USDT.connect(bob).approve(vault.address, eth(400000000000000000));
    await WETH.connect(bob).approve(vault.address, eth(400000000000000000));
    await AAVE.connect(bob).approve(vault.address, eth(400000000000000000));
  
    await vault.connect(bob).joinPool(poolId, bob.address, bob.address, joinPoolRequest);
  }

  before(async () => {

    wethToken = await getERC20(WETH);
    [, keeper, alice, bob] = await ethers.getSigners();
    controller = await ethers.getContractAt('IBabController', '0xD4a5b5fcB561dAF3aDF86F8477555B92FBa43b5F');
    owner = await impersonateAddress('0x97FcC2Ae862D03143b393e9fA73A32b563d57A6e');
    const keeperAdded = await controller.isValidKeeper(keeper.address);

    if (!keeperAdded) {
      await controller.connect(owner).addKeeper(keeper.address);
    }

    weightedPool3Token = await createPool();
    await joinPool(bob);

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
    let deploySuccessful = false;
    let balanceWithoutSwaps;

    const testFn = data.skip ? it.skip : it;

    testFn(`can deploy a strategy with the Balancer V2 integration: ${poolName}`, async function () {
      const poolAddress = typeof(data.poolAddress) === 'function' ? data.poolAddress() : data.poolAddress;
      const vault = await ethers.getContractAt("IVault", BALANCER_VAULT);
      const basePool = await ethers.getContractAt("BasePool", poolAddress);
      const poolId = await basePool.getPoolId();
      const bptToken = await getERC20(poolAddress);

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
          [poolAddress, 0] // integration params.
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
        const token = await getERC20(tokenAddress);
        const tokenBalance = await token.balanceOf(customStrategy.address);
        expect(tokenBalance).to.be.within(0, 10, `Token ${tokenAddress} was not consumed, balance left: ${tokenBalance}`);
      }

      // Finalize strategy
      await increaseTime(ONE_DAY_IN_SECONDS * 30);
      await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);

      // check that all BPT tokens were consumed
      bptBalance = await bptToken.balanceOf(customStrategy.address);
      expect(bptBalance).to.be.equals(0);

      deploySuccessful = true;
      balanceWithoutSwaps = await wethToken.balanceOf(garden.address);
    });

    testFn(`can receive rewards from swapping with the Balancer V2 integration: ${poolName}`, async function () {
      if (!deploySuccessful) {
        this.skip();
      }

      const poolAddress = typeof(data.poolAddress) === 'function' ? data.poolAddress() : data.poolAddress;
      const vault = await ethers.getContractAt("IVault", "0xBA12222222228d8Ba445958a75a0704d566BF2C8");
      const basePool = await ethers.getContractAt("BasePool", poolAddress);
      const poolId = await basePool.getPoolId();
      const bptToken = await getERC20(poolAddress);

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
          [poolAddress, 0] // integration params.
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

      // We iterate through the list of tokens and swap each token with
      // the next one in the list and back. This should give us a good amount
      // of swaps to earn some fees.
      const poolTokens = await vault.getPoolTokens(poolId);
      for (let i = 0; i < poolTokens.tokens.length - 1; ++i) {
        const tokenOne = await getERC20(poolTokens.tokens[i]);
        const tokenTwo = await getERC20(poolTokens.tokens[i + 1]);

        const tokenOneHolder = await impersonateAddress(getHolderForTokenAddress(tokenOne.address));

        const amountToSwap = await getSwapAmount(tokenOne);
        const tokenTwoBalanceBeforeSwap = await tokenTwo.balanceOf(tokenOneHolder.address);

        const singleSwap = {
          poolId: poolId,
          kind: 0, /* GIVEN_IN */
          assetIn: tokenOne.address,
          assetOut: tokenTwo.address,
          amount: amountToSwap,
          userData: "0x"
        };

        const funds = {
          sender: tokenOneHolder.address,
          fromInternalBalance: false,
          recipient: tokenOneHolder.address,
          toInternalBalance: false
        };

        let blockNumber = await ethers.provider.getBlockNumber();
        let blockBefore = await ethers.provider.getBlock(blockNumber);

        await tokenOne.connect(tokenOneHolder).approve(vault.address, amountToSwap);
        const tx = await vault.connect(tokenOneHolder).swap(singleSwap, funds, 0, (blockBefore.timestamp + 20));
        await tx.wait(1);

        const tokenTwoBalanceAfterSwap = await tokenTwo.balanceOf(tokenOneHolder.address);
        const amountToSwapBack = tokenTwoBalanceAfterSwap.sub(tokenTwoBalanceBeforeSwap);

        const singleSwapBack = {
          poolId: poolId,
          kind: 0, /* GIVEN_IN */
          assetIn: tokenTwo.address,
          assetOut: tokenOne.address,
          amount: amountToSwapBack,
          userData: "0x"
        };

        blockNumber = await ethers.provider.getBlockNumber();
        blockBefore = await ethers.provider.getBlock(blockNumber);

        await tokenTwo.connect(tokenOneHolder).approve(vault.address, amountToSwapBack);
        const tx2 = await vault.connect(tokenOneHolder).swap(singleSwapBack, funds, 0, (blockBefore.timestamp + 20));
        await tx2.wait(1);
      }

      // Finalize strategy
      await increaseTime(ONE_DAY_IN_SECONDS * 30);
      await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);
      bptBalance = await bptToken.balanceOf(customStrategy.address);

      expect(bptBalance).to.be.equals(0);

      const balanceWithSwaps = await wethToken.balanceOf(garden.address);
      expect(balanceWithSwaps).to.be.above(balanceWithoutSwaps);
    });
  }
});