module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/index.js',
    '!src/**/node_modules/**'
  ],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.jsx$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!@forge)'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};

