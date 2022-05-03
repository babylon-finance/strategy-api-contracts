module.exports = {
  skipFiles: ['mocks/ERC20Mock.sol', 'mocks/ProphetsArrivalV2Mock.sol', 'mocks/ProphetsV2Mock.sol'],
  mocha: {
    grep: '^(?!.*Launch)',
  },
};
