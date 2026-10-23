import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

// Path aliases (e.g. the ones added by `nest g library`) live in tsconfig.json,
// so they are read from there instead of being duplicated here.
const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    'apps/**/*.(t|j)s',
    // Exclude files that don't need coverage
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.enum.ts',
    '!src/**/*.type.ts',
    '!src/**/*.types.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.decorator.ts',
    '!src/database/migrations/**',
    '!src/database/data-source.ts',
    '!src/config/**',
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'html', 'lcov'],
  testEnvironment: 'node',
  // Timeout for async tests
  testTimeout: 30000,
};

export default config;
