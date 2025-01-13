import fs from 'fs';
import path from 'path';
import cliState from '../src/cliState';
import { getAndCheckProvider, getGradingProvider } from '../src/matchers';
import { matchesSimilarity, matchesLlmRubric } from '../src/matchers';
import { OpenAiChatCompletionProvider, OpenAiEmbeddingProvider } from '../src/providers/openai';
import { DefaultEmbeddingProvider, DefaultGradingProvider } from '../src/providers/openai';
import * as remoteGrading from '../src/remoteGrading';
import type { GradingConfig } from '../src/types';
import { TestGrader } from './util/utils';

jest.mock('../src/database', () => ({
  getDb: jest.fn().mockImplementation(() => {
    throw new TypeError('The "original" argument must be of type function. Received undefined');
  }),
}));
jest.mock('../src/esm');
jest.mock('../src/logger');
jest.mock('../src/cliState');
jest.mock('../src/remoteGrading', () => ({
  doRemoteGrading: jest.fn(),
}));
jest.mock('../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(true),
}));
jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));
jest.mock('better-sqlite3');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

const Grader = new TestGrader();

describe('matchesSimilarity', () => {
  beforeEach(() => {
    jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi').mockImplementation((text) => {
      if (text === 'Expected output' || text === 'Sample output') {
        return Promise.resolve({
          embedding: [1, 0, 0],
          tokenUsage: { total: 5, prompt: 2, completion: 3 },
        });
      } else if (text === 'Different output') {
        return Promise.resolve({
          embedding: [0, 1, 0],
          tokenUsage: { total: 5, prompt: 2, completion: 3 },
        });
      }
      return Promise.reject(new Error('Unexpected input'));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass when similarity is above the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;

    await expect(matchesSimilarity(expected, output, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Similarity 1.00 is greater than threshold 0.5',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
      },
    });
  });

  it('should fail when similarity is below the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const threshold = 0.9;

    await expect(matchesSimilarity(expected, output, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Similarity 0.00 is less than threshold 0.9',
      score: 0,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
      },
    });
  });

  it('should fail when inverted similarity is above the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;

    await expect(
      matchesSimilarity(expected, output, threshold, true /* invert */),
    ).resolves.toEqual({
      pass: false,
      reason: 'Similarity 1.00 is greater than threshold 0.5',
      score: 0,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
      },
    });
  });

  it('should pass when inverted similarity is below the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const threshold = 0.9;

    await expect(
      matchesSimilarity(expected, output, threshold, true /* invert */),
    ).resolves.toEqual({
      pass: true,
      reason: 'Similarity 0.00 is less than threshold 0.9',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
      },
    });
  });

  it('should use the overridden similarity grading config', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;
    const grading: GradingConfig = {
      provider: {
        id: 'openai:embedding:text-embedding-ada-9999999',
        config: {
          apiKey: 'abc123',
          temperature: 3.1415926,
        },
      },
    };

    const mockCallApi = jest.spyOn(OpenAiEmbeddingProvider.prototype, 'callEmbeddingApi');
    mockCallApi.mockImplementation(function (this: OpenAiChatCompletionProvider) {
      expect(this.config.temperature).toBe(3.1415926);
      expect(this.getApiKey()).toBe('abc123');
      return Promise.resolve({
        embedding: [1, 0, 0],
        tokenUsage: { total: 5, prompt: 2, completion: 3 },
      });
    });

    await expect(matchesSimilarity(expected, output, threshold, false, grading)).resolves.toEqual({
      pass: true,
      reason: 'Similarity 1.00 is greater than threshold 0.5',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
      },
    });
    expect(mockCallApi).toHaveBeenCalledWith('Expected output');

    mockCallApi.mockRestore();
  });

  it('should throw an error when API call fails', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;
    const grading: GradingConfig = {
      provider: {
        id: 'openai:embedding:text-embedding-ada-9999999',
        config: {
          apiKey: 'abc123',
          temperature: 3.1415926,
        },
      },
    };

    jest
      .spyOn(OpenAiEmbeddingProvider.prototype, 'callEmbeddingApi')
      .mockRejectedValueOnce(new Error('API call failed'));

    await expect(async () => {
      await matchesSimilarity(expected, output, threshold, false, grading);
    }).rejects.toThrow('API call failed');
  });

  it('should use Nunjucks templating when PROMPTFOO_DISABLE_TEMPLATING is set', async () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const expected = 'Expected {{ var }}';
    const output = 'Output {{ var }}';
    const threshold = 0.8;
    const grading: GradingConfig = {
      provider: DefaultEmbeddingProvider,
    };

    jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi').mockResolvedValue({
      embedding: [1, 2, 3],
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await matchesSimilarity(expected, output, threshold, false, grading);

    expect(DefaultEmbeddingProvider.callEmbeddingApi).toHaveBeenCalledWith('Expected {{ var }}');
    expect(DefaultEmbeddingProvider.callEmbeddingApi).toHaveBeenCalledWith('Output {{ var }}');

    process.env.PROMPTFOO_DISABLE_TEMPLATING = undefined;
  });
});

describe('matchesLlmRubric', () => {
  const mockFilePath = path.join('path', 'to', 'external', 'rubric.txt');
  const mockFileContent = 'This is an external rubric prompt';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
  });

  it('should pass when the grading provider returns a passing result', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: Grader,
    };

    await expect(matchesLlmRubric(expected, output, options)).resolves.toEqual({
      pass: true,
      reason: 'Test grading output',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
      },
    });
  });

  it('should fail when the grading provider returns a failing result', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: Grader,
    };

    jest.spyOn(Grader, 'callApi').mockResolvedValueOnce({
      output: JSON.stringify({ pass: false, reason: 'Grading failed' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await expect(matchesLlmRubric(expected, output, options)).resolves.toEqual({
      pass: false,
      reason: 'Grading failed',
      score: 0,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
      },
    });
  });

  it('should use the overridden llm rubric grading config', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: {
        id: 'openai:gpt-4o-mini',
        config: {
          apiKey: 'abc123',
          temperature: 3.1415926,
        },
      },
    };

    const mockCallApi = jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi');
    mockCallApi.mockImplementation(function (this: OpenAiChatCompletionProvider) {
      expect(this.config.temperature).toBe(3.1415926);
      expect(this.getApiKey()).toBe('abc123');
      return Promise.resolve({
        output: JSON.stringify({ pass: true, reason: 'Grading passed' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    await expect(matchesLlmRubric(expected, output, options)).resolves.toEqual({
      reason: 'Grading passed',
      pass: true,
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
      },
    });
    expect(mockCallApi).toHaveBeenCalledWith('Grading prompt');

    mockCallApi.mockRestore();
  });

  it('should load rubric prompt from external file when specified', async () => {
    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading = {
      rubricPrompt: `file://${mockFilePath}`,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    const result = await matchesLlmRubric(rubric, llmOutput, grading);

    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('path', 'to', 'external', 'rubric.txt')),
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('path', 'to', 'external', 'rubric.txt')),
      'utf8',
    );
    expect(grading.provider.callApi).toHaveBeenCalledWith(expect.stringContaining(mockFileContent));
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Test passed',
      tokensUsed: {
        total: 10,
        prompt: 5,
        completion: 5,
        cached: 0,
      },
    });
  });

  it('should throw an error when the external file is not found', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);

    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading = {
      rubricPrompt: `file://${mockFilePath}`,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    await expect(matchesLlmRubric(rubric, llmOutput, grading)).rejects.toThrow(
      'File does not exist',
    );

    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('path', 'to', 'external', 'rubric.txt')),
    );
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(grading.provider.callApi).not.toHaveBeenCalled();
  });

  it('should not call remote when rubric prompt is overridden, even if redteam is enabled', async () => {
    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading = {
      rubricPrompt: 'Custom prompt',
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    // Give it a redteam config
    cliState.config = { redteam: {} };

    await matchesLlmRubric(rubric, llmOutput, grading);

    const { doRemoteGrading } = remoteGrading;
    expect(doRemoteGrading).not.toHaveBeenCalled();

    expect(grading.provider.callApi).toHaveBeenCalledWith(expect.stringContaining('Custom prompt'));
  });

  it('should call remote when redteam is enabled and rubric prompt is not overridden', async () => {
    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading = {
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    // Give it a redteam config
    cliState.config = { redteam: {} };

    await matchesLlmRubric(rubric, llmOutput, grading);

    const { doRemoteGrading } = remoteGrading;
    expect(doRemoteGrading).toHaveBeenCalledWith({
      task: 'llm-rubric',
      rubric,
      output: llmOutput,
      vars: {},
    });

    expect(grading.provider.callApi).not.toHaveBeenCalled();
  });
});

describe('getGradingProvider', () => {
  it('should return the correct provider when provider is a string', async () => {
    const provider = await getGradingProvider(
      'text',
      'openai:chat:gpt-4o-mini-foobar',
      DefaultGradingProvider,
    );
    // ok for this not to match exactly when the string is parsed
    expect(provider?.id()).toBe('openai:gpt-4o-mini-foobar');
  });

  it('should return the correct provider when provider is an ApiProvider', async () => {
    const provider = await getGradingProvider(
      'embedding',
      DefaultEmbeddingProvider,
      DefaultGradingProvider,
    );
    expect(provider).toBe(DefaultEmbeddingProvider);
  });

  it('should return the correct provider when provider is ProviderOptions', async () => {
    const providerOptions = {
      id: 'openai:chat:gpt-4o-mini-foobar',
      config: {
        apiKey: 'abc123',
        temperature: 3.1415926,
      },
    };
    const provider = await getGradingProvider('text', providerOptions, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:chat:gpt-4o-mini-foobar');
  });

  it('should return the default provider when provider is not provided', async () => {
    const provider = await getGradingProvider('text', undefined, DefaultGradingProvider);
    expect(provider).toBe(DefaultGradingProvider);
  });
});

describe('getAndCheckProvider', () => {
  it('should return the default provider when provider is not defined', async () => {
    await expect(
      getAndCheckProvider('text', undefined, DefaultGradingProvider, 'test check'),
    ).resolves.toBe(DefaultGradingProvider);
  });

  it('should return the default provider when provider does not support type', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: () => Promise.resolve({ output: 'test' }),
    };
    await expect(
      getAndCheckProvider('embedding', provider, DefaultEmbeddingProvider, 'test check'),
    ).resolves.toBe(DefaultEmbeddingProvider);
  });

  it('should return the provider if it implements the required method', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: () => Promise.resolve({ output: 'test' }),
      callEmbeddingApi: () => Promise.resolve({ embedding: [] }),
    };
    const result = await getAndCheckProvider(
      'embedding',
      provider,
      DefaultEmbeddingProvider,
      'test check',
    );
    expect(result).toBe(provider);
  });

  it('should return the default provider when no provider is specified', async () => {
    const provider = await getGradingProvider('text', undefined, DefaultGradingProvider);
    expect(provider).toBe(DefaultGradingProvider);
  });

  it('should return a specific provider when a provider id is specified', async () => {
    const provider = await getGradingProvider('text', 'openai:chat:foo', DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:foo');
  });
});
