const { expect } = require('chai');
const { ethers } = require('hardhat');
const addresses = require('../../lib/addresses');
const { getERC20, increaseTime } = require('../utils/test-helpers');
const { ADDRESS_ZERO, ONE_DAY_IN_SECONDS } = require('../../lib/constants');
const { impersonateAddress } = require('../../lib/rpc');
const { eth, getBabylonContractByName } = require('../../lib/helpers');
const { deployments } = require('hardhat');
const { deploy } = deployments;
// const { takeSnapshot, restoreSnapshot } = require('lib/rpc');

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const UniswapV3TradeIntegration = '0xc300FB5dE5384bcA63fb6eb3EfD9DB7dFd10325C';
const NFT_URI = 'https://babylon.mypinata.cloud/ipfs/QmcL826qNckBzEk2P11w4GQrrQFwGvR6XmUCuQgBX9ck1v';
const NFT_SEED = '504592746';
const IDLE_FINANCE_PRICE_HELPER_ADDRESS = '0x04Ce60ed10F6D2CfF3AA015fc7b950D13c113be5';
const IDLE_FINANCE_CDO_REGISTRY_ADDRESS = '0x84FDeE80F18957A041354E99C7eB407467D94d8E';
const LIQUITY_BORROWER_OPERATIONS_ADDDRESS = '0x24179CD81c9e782A4096035f7eC97fB8B783e007';
const LUSD_ADDRESS = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
const LUSD_WHALE = '0x66017d22b0f8556afdd19fc67041899eb65a21bb';

const IDLE_VAULTS = {
  bestYield: {
    DAI: '0x3fe7940616e5bc47b0775a0dccf6237893353bb4',
    USDC: '0x5274891bEC421B39D23760c04A6755eCB444797C',
    USDT: '0xF34842d05A1c888Ca02769A633DF37177415C2f8',
    SUSD: '0xf52cdcd458bf455aed77751743180ec4a595fd3f',
    TUSD: '0xc278041fdd8249fe4c1aad1193876857eea3d68c',
    WBTC: '0x8C81121B15197fA0eEaEE1DC75533419DcfD3151',
    WETH: '0xc8e6ca6e96a326dc448307a5fde90a0b21fd7f80',
    RAI: '0x5c960a3dcc01be8a0f49c02a8cebcacf5d07fabe',
    FEI: '0xb2d5CB72A621493fe83C6885E4A776279be595bC'
  },
  perpetualYield: {
    'Idle DAI': {
      tranches: {
        senior: '0xe9ada97bdb86d827ecbaacca63ebcd8201d8b12e',
        junior: '0x730348a54ba58f64295154f0662a08cbde1225c2'
      }
    },
    'Idle FEI': {
      tranches: {
        senior: '0x9ce3a740df498646939bcbb213a66bbfa1440af6',
        junior: '0x2490d810bf6429264397ba721a488b0c439aa745'
      }
    },
    'Lido stETH': {
      tranches: {
        senior: '0x2688fc68c4eac90d9e5e1b94776cf14eade8d877',
        junior: '0x3a52fa30c33caf05faee0f9c5dfe5fd5fe8b3978'
      }
    },
    'Convex FRAX3Crv': {
      curvePool: '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B',
      tranches: {
        senior: '0x15794da4dcf34e674c18bbfaf4a67ff6189690f5',
        junior: '0x18cf59480d8c16856701f66028444546b7041307'
      }
    },
    'Convex MIM3Crv': {
      curvePool: '0x5a6A4D54456819380173272A5E8E9B9904BdF41B',
      tranches: {
        senior: '0xfc96989b3df087c96c806318436b16e44c697102',
        junior: '0x5346217536852cd30a5266647ccbb6f73449cbd1'
      }
    },
    'Convex steCrv': {
      curvePool: '0xDC24316b9AE028F1497c275EB9192a3Ea0f67022',
      tranches: {
        senior: '0x060a53bcfdc0452f35ebd2196c6914e0152379a6',
        junior: '0xd83246d2bcbc00e85e248a6e9aa35d0a1548968e'
      }
    },
    'Convex ALUSDCrv': {
      curvePool: '0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c',
      tranches: {
        senior: '0x790e38d85a364dd03f682f5ecdc88f8ff7299908',
        junior: '0xa0e8c9088afb3fa0f40ecdf8b551071c34aa1aa4'
      }
    },

    // No swap route to any of these tokens, so leaving it out of the tests for now..
    // 'Convex 3EUR': {
    //   curvePool: '0xb9446c4Ef5EBE66268dA6700D26f96273DE3d571',
    //   tranches: {
    //     senior: '0x158e04225777bbea34d2762b5df9ebd695c158d2',
    //     junior: '0x3061c652b49ae901bbecf622624cc9f633d01bbd'
    //   }
    // },

    'Convex musd3CRV': {
      curvePool: '0x8474DdbE98F5aA3179B3B3F5942D724aFcdec9f6',
      tranches: {
        senior: '0x4585f56b06d098d4edbfc5e438b8897105991c6a',
        junior: '0xfb08404617b6afab0b19f6ceb2ef9e07058d043c'
      }
    },

    // No price for this trade, either
    // 'Convex pbtc/sbtcCRV': {
    //   curvePool: '0x7F55DDe206dbAD629C080068923b36fe9D6bDBeF',
    //   tranches: {
    //     senior: '0x4657b96d587c4d46666c244b40216beeea437d0d',
    //     junior: '0x3872418402d1e967889ac609731fc9e11f438de5'
    //   }
    // }
  }
}

describe('Babylon integrations', function () {
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
    // await controller.connect(owner).addKeeper(keeper.address);

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

  beforeEach(async () => {});

  afterEach(async () => {});

  it('can deploy a strategy with the Yearn Custom integration', async () => {

    // We deploy the custom yearn integration. Change with your own integration when ready
    const customIntegration = await deploy('CustomIntegrationYearn', {
      from: alice.address,
      args: [controller.address, '0x61c733fE0Eb89b75440A21cD658C4011ec512EB8'],
    });

    await garden.connect(alice).addStrategy(
      'Yearn USDT Vault',
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
        ['0x7Da96a3891Add058AdA2E826306D812C638D87a7', 0] // integration params. We pass USDT vault
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

    // Finalize strategy
    await increaseTime(ONE_DAY_IN_SECONDS * 30);
    await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);
  });

  it('can deploy a strategy with a CRV + Yearn Custom integration. 3pool', async () => {

    // We deploy the custom yearn integration. Change with your own integration when ready
    const customIntegration = await deploy('CustomIntegrationYearn', {
      from: alice.address,
      args: [controller.address, '0x61c733fE0Eb89b75440A21cD658C4011ec512EB8'],
    });

    const integrations = [
      'MasterSwapper',
      'BalancerIntegration',
      'LidoStakeIntegration',
      'CurvePoolIntegration',
      'CurveGaugeIntegration',
      'ConvexStakeIntegration',
      'UniswapV3TradeIntegration',
      'CompoundLendIntegration',
      'CompoundBorrowIntegration',
      'FuseLendIntegration',
      'FuseBorrowIntegration',
      'AaveLendIntegration',
      'AaveBorrowIntegration',
      'UniswapPoolIntegration',
      'PickleJarIntegration',
      'PickleFarmIntegration',
      'StakewiseIntegration',
      'SushiswapPoolIntegration',
      'YearnVaultIntegration',
    ];

    const curvePoolIntegrationAddress = getBabylonContractByName('CurvePoolIntegration');


    const crvPool3crypto = '0xD51a44d3FaE010294C616388b506AcdA1bfAAE46';
    const yearnvault3crypto = '0xE537B5cc158EB71037D4125BDD7538421981E6AA';
    await garden.connect(alice).addStrategy(
      'CRV 3Pool + yearn vault',
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
      [1, 5], // _opTypes
      [curvePoolIntegrationAddress, customIntegration.address], // _opIntegrations
      new ethers.utils.AbiCoder().encode(
        ['address', 'uint256', 'address', 'uint256'],
        [crvPool3crypto, 0, yearnvault3crypto, 0] // integration params. We pass 3crypto pool + yearn vault
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

    // Finalize strategy
    await increaseTime(ONE_DAY_IN_SECONDS * 30);
    await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);
  });

  for (const [vaultSymbol, vaultAddress] of Object.entries(IDLE_VAULTS.bestYield)) {
    it(`can deploy a strategy with CustomIntegrationIdleFinanceBestYield - ${vaultSymbol}`, async () => {

      // We deploy the custom idle.finance integration
      const customIntegration = await deploy('CustomIntegrationIdleFinanceBestYield', {
        from: alice.address,
        args: [controller.address, IDLE_FINANCE_PRICE_HELPER_ADDRESS],
      });

      await garden.connect(alice).addStrategy(
        `Idle Finance Best Yield - ${vaultSymbol} Vault`,
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
          [vaultAddress, 0]
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

      // Finalize strategy
      await increaseTime(ONE_DAY_IN_SECONDS * 30);
      await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);
    });
  }

  for (const [vaultName, data] of Object.entries(IDLE_VAULTS.perpetualYield)) {
    for (const [trancheType, trancheAddress] of Object.entries(data.tranches)) {
      it(`can deploy a strategy with CustomIntegrationIdleFinancePerpetualYield - ${vaultName} - ${trancheType}`, async () => {

        const curvePoolIntegrationAddress = getBabylonContractByName('CurvePoolIntegration');

        // We deploy the custom idle.finance integration
        const customIntegration = await deploy('CustomIntegrationIdleFinancePerpetualYield', {
          from: alice.address,
          args: [controller.address, IDLE_FINANCE_CDO_REGISTRY_ADDRESS],
        });

        let opTypes
        let opIntegrations
        let opEncodedData
        if (data.curvePool) {
          opTypes = [1, 5]
          opIntegrations = [curvePoolIntegrationAddress, customIntegration.address]
          opEncodedData = new ethers.utils.AbiCoder().encode(
            ['address', 'uint256', 'address', 'uint256'],
            [data.curvePool, 0, trancheAddress, 0]
          )
        } else {
          opTypes = [5]
          opIntegrations = [customIntegration.address]
          opEncodedData = new ethers.utils.AbiCoder().encode(
            ['address', 'uint256'],
            [trancheAddress, 0]
          )
        }

        await garden.connect(alice).addStrategy(
          `Idle Finance Perpetual Yield - ${vaultName} - ${trancheType}`,
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
          opTypes,
          opIntegrations,
          opEncodedData,
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

        // Finalize strategy
        await increaseTime(ONE_DAY_IN_SECONDS * 30);
        await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);
      });
    }
  }

  it('can deploy a strategy with the Liquity Integration', async () => {

    const customIntegration = await deploy('CustomIntegrationLiquity', {
      from: alice.address,
      args: [controller.address, LIQUITY_BORROWER_OPERATIONS_ADDDRESS],
    });

    await garden.connect(alice).addStrategy(
      'Liquity',
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
        [ADDRESS_ZERO, eth(3000)] // integration params, 3000 LUSD borrow
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

    // Need additional LUSD to repay debt
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [LUSD_WHALE]
    })
    const lusdWhaleTransmitter = await ethers.provider.getSigner(LUSD_WHALE)
    const lusdErc20 = await getERC20(LUSD_ADDRESS)

    // transfer 15 LUSD to strategy
    await lusdErc20.connect(lusdWhaleTransmitter).transfer(customStrategy.address, eth(15))

    // Finalize strategy
    await increaseTime(ONE_DAY_IN_SECONDS * 30);
    await customStrategy.connect(keeper).finalizeStrategy(0, '', 0);
  });
});
