import { jest } from '@jest/globals';
import dedent from 'dedent';
import { showRedteamProviderLabelMissingWarning } from '../../src/commands/eval';
import logger from '../../src/logger';
import type { TestSuite } from '../../src/types';

jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('chalk', () => ({
  bold: {
    yellow: (str: string) => str,
  },
}));

describe('showRedteamProviderLabelMissingWarning', () => {
  let mockWarn: jest.Mock<any>;

  beforeEach(() => {
    mockWarn = jest.fn();
    jest.spyOn(logger, 'warn').mockImplementation(mockWarn);
  });

  it('should show warning when provider has no label', () => {
    const testSuite: TestSuite = {
      providers: [
        {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test', status: 200, statusText: 'OK' }),
        },
      ],
      prompts: [],
      tests: [],
      defaultTest: {},
      scenarios: [],
    };

    showRedteamProviderLabelMissingWarning(testSuite);

    expect(mockWarn).toHaveBeenCalledWith(dedent`
      Warning: Your target (provider) does not have a label specified.

      Labels are used to uniquely identify redteam targets. Please set a meaningful and unique label (e.g., 'helpdesk-search-agent') for your targets/providers in your redteam config.

      Provider ID will be used as a fallback if no label is specified.
    `);
  });

  it('should not show warning when all providers have labels', () => {
    const testSuite: TestSuite = {
      providers: [
        {
          id: () => 'test-provider',
          label: 'test-label',
          callApi: async () => ({ output: 'test', status: 200, statusText: 'OK' }),
        },
      ],
      prompts: [],
      tests: [],
      defaultTest: {},
      scenarios: [],
    };

    showRedteamProviderLabelMissingWarning(testSuite);

    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('should handle empty providers array', () => {
    const testSuite: TestSuite = {
      providers: [],
      prompts: [],
      tests: [],
      defaultTest: {},
      scenarios: [],
    };

    showRedteamProviderLabelMissingWarning(testSuite);

    expect(mockWarn).not.toHaveBeenCalled();
  });
});
