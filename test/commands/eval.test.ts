import { Command } from 'commander';
import {
  evalCommand,
  showRedteamProviderLabelMissingWarning,
  doEval,
} from '../../src/commands/eval';
import { filterTests } from '../../src/commands/eval/filterTests';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { createShareableUrl } from '../../src/share';
import { resolveConfigs } from '../../src/util/config/load';

jest.mock('../../src/logger');
jest.mock('../../src/util/config/load');
jest.mock('../../src/commands/eval/filterTests');
jest.mock('../../src/models/eval');
jest.mock('../../src/share');
jest.mock('../../src/telemetry');

describe('showRedteamProviderLabelMissingWarning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should log a warning if a provider is missing a label', () => {
    const mockTestSuite = {
      providers: [{ label: '' }, { label: 'provider1' }],
    } as any;

    showRedteamProviderLabelMissingWarning(mockTestSuite);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Your target (provider) does not have a label specified.'),
    );
  });

  it('should not log a warning if all providers have labels', () => {
    const mockTestSuite = {
      providers: [{ label: 'provider1' }, { label: 'provider2' }],
    } as any;

    showRedteamProviderLabelMissingWarning(mockTestSuite);

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('doEval', () => {
  const mockCmdObj = {
    envPath: './.env',
    verbose: true,
    config: ['./config1.yaml', './config2.yaml'],
    filterFirstN: 10,
    write: true,
    share: true,
  };

  const mockDefaultConfig = { evaluateOptions: { maxConcurrency: 2 } };
  const mockDefaultConfigPath = './defaultConfig.yaml';
  const mockEvaluateOptions = { abortSignal: undefined };

  beforeEach(() => {
    jest.clearAllMocks();

    const mockEvalInstance = {
      prompts: [],
      config: {
        outputPath: ['./output.json'],
        sharing: true,
      },
      addPrompts: jest.fn(),
      getTable: jest.fn(),
    } as any;

    jest.mocked(resolveConfigs).mockResolvedValue({
      config: {
        outputPath: ['./output.json'],
        sharing: true,
      },
      testSuite: {
        tests: [],
        providers: [],
        prompts: [],
      },
      basePath: './',
    });

    jest.mocked(filterTests).mockResolvedValue([]);
    jest.mocked(Eval.create).mockResolvedValue(mockEvalInstance);
    jest.mocked(createShareableUrl).mockResolvedValue('https://shareable-url.com');
  });

  it('should set up the environment and process evaluation', async () => {
    await doEval(mockCmdObj, mockDefaultConfig, mockDefaultConfigPath, mockEvaluateOptions);

    expect(resolveConfigs).toHaveBeenCalledWith(
      expect.objectContaining(mockCmdObj),
      mockDefaultConfig,
    );
    expect(filterTests).toHaveBeenCalledWith(
      expect.objectContaining({ tests: [] }),
      expect.objectContaining({
        failing: undefined,
        firstN: 10,
        metadata: undefined,
        pattern: undefined,
        sample: undefined,
      }),
    );
  });

  it('should create a shareable URL when share option is enabled', async () => {
    await doEval(mockCmdObj, mockDefaultConfig, mockDefaultConfigPath, mockEvaluateOptions);

    expect(createShareableUrl).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('https://shareable-url.com'));
  });
});

describe('evalCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    jest.clearAllMocks();
  });

  it('should set up the eval command with correct options', () => {
    const command = evalCommand(program, {}, undefined);
    expect(command.name()).toBe('eval');
    expect(command.description()).toBe('Evaluate prompts');
  });

  it('should validate options and call doEval on action', async () => {
    const mockDoEval = jest.spyOn({ doEval }, 'doEval').mockResolvedValue({} as any);
    const command = evalCommand(program, {}, undefined);

    await command.parseAsync(['node', 'test', '--config', './config.yaml', '--verbose'], {
      from: 'user',
    });

    expect(mockDoEval).toHaveBeenCalledWith(
      expect.objectContaining({
        config: ['./config.yaml'],
        verbose: true,
      }),
      {},
      undefined,
      expect.any(Object),
    );
    mockDoEval.mockRestore();
  });

  it('should log a warning for unknown commands', async () => {
    const command = evalCommand(program, {}, undefined);

    await command.parseAsync(['node', 'test', 'unknown-command'], { from: 'user' });

    expect(logger.warn).toHaveBeenCalledWith(
      'Unknown command: unknown-command. Did you mean -c unknown-command?',
    );
  });
});
