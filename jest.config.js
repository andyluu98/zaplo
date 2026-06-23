/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  preset: 'ts-jest', // Sử dụng preset của ts-jest
  testEnvironment: 'node', // Môi trường chạy test là Node.js
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {}], // Biến đổi tệp TypeScript và TSX bằng ts-jest
  },
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'], // Đường dẫn đến các tệp test
  // Ignore nested git worktrees (under .claude/worktrees) to avoid Haste module name collisions.
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees'],
};
