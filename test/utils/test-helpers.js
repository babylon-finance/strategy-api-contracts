const { ethers } = require('hardhat');
const { tokens, holders } = require('../../lib/addresses');

/**
 * Advance blockchain time by value. Has a random chance to deviate by 1 second.
 * Consider this during tests. Use `closeTo`.
 * @param {number} value - Amount of time to advance time by.
 */
async function increaseTime(value) {
  if (!ethers.BigNumber.isBigNumber(value)) {
    value = ethers.BigNumber.from(value);
  }
  await ethers.provider.send('evm_increaseTime', [value.toNumber()]);
  await ethers.provider.send('evm_mine');
}
/**
 * Advance blockchain time by value. Has a random chance to deviate by 1 second.
 * Consider this during tests. Use `closeTo`.
 * @param {number} blocks - Amount of blocks to advance the chain by.
 */
// this is super slow but hardhat doesn't allow mine multiple blocks right now
// should be fixed once this functionality avaiable
async function increaseBlock(blocks) {
  if (!ethers.BigNumber.isBigNumber(blocks)) {
    blocks = ethers.BigNumber.from(blocks);
  }
  for (let i = 0; i < blocks; i++) {
    await ethers.provider.send('evm_increaseTime', [20]); // 20 seconds per block
    await ethers.provider.send('evm_mine');
  }
}

/**
 * Can't await on transactionSend because it will never resolve due to
 * automine disabled. Save a promise instead and resolve it later.
 * Should set gasLimit on txs because default gasLimit is blockGasLimit.
 *   promise = signer.sendTransaction({
 *      to: signer.address,
 *      value: 1,
 *    });
 *   const txReceipt = await promise;
 * @param {func} Lambda to run within the same block.
 */
async function mineInBlock(lambda) {
  await ethers.provider.send('evm_setAutomine', [false]);
  await lambda();
  await ethers.provider.send('evm_mine');
  await ethers.provider.send('evm_setAutomine', [true]);
}

async function getTimestamp() {
  return (await ethers.provider.getBlock('latest')).timestamp;
}

async function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getContract(contractName, deploymentName) {
  return await ethers.getContractAt(contractName, (await deployments.get(deploymentName || contractName)).address);
}

async function getERC20(address) {
  return await ethers.getContractAt('@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20', address);
}

function eth(value = 1) {
  return ethers.utils.parseEther(value.toString());
}

function normalizeDecimals(tokenDecimals, tokenDecimalsTarget, quantity) {
  if (tokenDecimals == tokenDecimalsTarget) {
    return quantity;
  }
  if (tokenDecimalsTarget > tokenDecimals) {
    return quantity.mul(10 ** (tokenDecimalsTarget - tokenDecimals));
  }
  return quantity.div(10 ** (tokenDecimals - tokenDecimalsTarget));
}

function enums(...options) {
  return Object.fromEntries(options.map((key, i) => [key, new ethers.BigNumber.from(i)]));
}

function pick(arr) {
  let FAST = process.env.FAST;
  return !!FAST ? arr.slice(0, 1) : arr;
}

function skipIfFast() {
  let FAST = process.env.FAST;
  return !!FAST ? describe.skip : describe;
}

function getTokenName(tokenAddress) {
  for ([tokenName, address] of Object.entries(tokens)) {
    if (address === tokenAddress) {
      return tokenName;
    }
  }

  throw `No token name found for address ${tokenAddress}`;
}

function getHolderForTokenAddress(tokenAddress) {
  return getHolderForToken(getTokenName(tokenAddress));
}

function getHolderForToken(token) {
  const tokenHolders = holders;
  if (token in tokenHolders) {
    return tokenHolders[token];
  }

  throw `No holder defined for token ${token}`;
}

module.exports = {
  pick,
  skipIfFast,
  getERC20,
  increaseTime,
  increaseTime,
  increaseBlock,
  getTimestamp,
  mineInBlock,
  sleep,
  from: ethers.BigNumber.from,
  parse: ethers.utils.parseEther,
  getContract,
  eth,
  normalizeDecimals,
  enums,
  getHolderForToken,
  getHolderForTokenAddress,
  getTokenName,
  proposalState: enums('Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'),
  voteType: enums('Against', 'For', 'Abstain'),
};
