import logger from '../src/logger';
import { retryWithDeduplication, sampleArray } from '../src/util/generation';

jest.mock('../src/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
}));

describe('retryWithDeduplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should collect unique items until the target count is reached', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([2, 3])
      .mockResolvedValueOnce([3, 4]);

    const dedupFn = jest.fn((items) => Array.from(new Set(items)));

    const result = await retryWithDeduplication(operation, 4, 2, dedupFn);

    expect(result).toEqual([1, 2, 3, 4]);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(dedupFn).toHaveBeenCalledWith([1, 2]);
    expect(dedupFn).toHaveBeenCalledWith([1, 2, 2, 3]);
    expect(dedupFn).toHaveBeenCalledWith([1, 2, 3, 3, 4]);
  });

  it('should stop when max consecutive retries are reached', async () => {
    const operation = jest.fn().mockResolvedValue([]);
    const dedupFn = jest.fn((items) => items);

    const result = await retryWithDeduplication(operation, 4, 2, dedupFn);

    expect(result).toEqual([]);
    expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith('No new unique items. Consecutive retries: 1');
  });

  it('should handle non-array results from the operation gracefully', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([2]);

    const dedupFn = jest.fn((items) => Array.from(new Set(items)));

    const result = await retryWithDeduplication(operation, 2, 2, dedupFn);

    expect(result).toEqual([1, 2]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Operation returned non-iterable result. Skipping this iteration.',
    );
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('should use default deduplication function if none is provided', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 2 }, { id: 3 }]);

    const result = await retryWithDeduplication(operation, 3);

    expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should handle an empty operation result gracefully', async () => {
    const operation = jest.fn().mockResolvedValue([]);
    const dedupFn = jest.fn((items) => items);

    const result = await retryWithDeduplication(operation, 2, 2, dedupFn);

    expect(result).toEqual([]);
    expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });
});

describe('sampleArray', () => {
  it('should return n randomly sampled items from the array', () => {
    const array = [1, 2, 3, 4, 5];
    const result = sampleArray(array, 3);

    expect(result).toHaveLength(3);
    result.forEach((item) => {
      expect(array).toContain(item);
    });
  });

  it('should return the entire array if n is greater than the array length', () => {
    const array = [1, 2, 3];
    const result = sampleArray(array, 5);

    expect(result).toEqual(expect.arrayContaining(array));
    expect(result).toHaveLength(3);
  });

  it('should return an empty array if the input array is empty', () => {
    const array: number[] = [];
    const result = sampleArray(array, 3);

    expect(result).toEqual([]);
  });
});
