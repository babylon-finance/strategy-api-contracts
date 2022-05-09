const { expect } = require('chai');
const { ethers } = require('hardhat');
const addresses = require('../../lib/addresses');
const { getERC20, increaseTime } = require('../utils/test-helpers');
const { ADDRESS_ZERO, ONE_DAY_IN_SECONDS } = require('../../lib/constants');
const { impersonateAddress } = require('../../lib/rpc');
const { eth } = require('../../lib/helpers');
// const { deployments } = require('hardhat');
// const { deploy } = deployments;
// const { takeSnapshot, restoreSnapshot } = require('lib/rpc');
// const { getContracts, deployFixture } = require('lib/deploy');

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const UniswapV3TradeIntegration = '0xc300FB5dE5384bcA63fb6eb3EfD9DB7dFd10325C';
const NFT_URI = 'https://babylon.mypinata.cloud/ipfs/QmcL826qNckBzEk2P11w4GQrrQFwGvR6XmUCuQgBX9ck1v';
const NFT_SEED = '504592746';

describe('Babylon integrations', function () {
  let owner;
  let garden;
  let strategy;
  let controller;
  let keeper;
  let alice;
  let bob;

  // before(async () => {
  //   [, keeper, alice, bob] = await ethers.getSigners();
  //   controller = await ethers.getContractAt('IBabController', '0xD4a5b5fcB561dAF3aDF86F8477555B92FBa43b5F');
  //   const owner = await impersonateAddress('0x97FcC2Ae862D03143b393e9fA73A32b563d57A6e');
  //   await controller.connect(owner).addKeeper(keeper.address);
  // });
  //
  // beforeEach(async () => {});
  //
  // afterEach(async () => {});

  it.skip('can add a custom integration', async () => {
    // Coming soon
  });
});
