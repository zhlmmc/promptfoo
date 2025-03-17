import { vi, describe, it, expect, beforeEach } from 'vitest';
import { callApi, fetchUserEmail, updateEvalAuthor } from './api';

vi.mock('@app/stores/apiConfig', () => ({
  default: {
    getState: vi.fn(() => ({
      apiBaseUrl: 'http://localhost:3000',
    })),
  },
}));

describe('api utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    global.fetch = vi.fn();
  });

  describe('callApi', () => {
    it('should call fetch with correct URL and options', async () => {
      const mockResponse = { ok: true };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);

      const path = '/test';
      const options = { method: 'POST' };

      const response = await callApi(path, options);

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/test', options);
      expect(response).toBe(mockResponse);
    });
  });

  describe('fetchUserEmail', () => {
    it('should return email when API call succeeds', async () => {
      const mockEmail = 'test@example.com';
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ email: mockEmail }),
      } as Response);

      const result = await fetchUserEmail();

      expect(result).toBe(mockEmail);
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/user/email', {
        method: 'GET',
      });
    });

    it('should return null when API call fails', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
      } as Response);

      const result = await fetchUserEmail();

      expect(result).toBeNull();
    });

    it('should return null when API throws error', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const result = await fetchUserEmail();

      expect(result).toBeNull();
    });
  });

  describe('updateEvalAuthor', () => {
    it('should update eval author successfully', async () => {
      const mockResponse = { success: true };
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const evalId = '123';
      const author = 'John Doe';

      const result = await updateEvalAuthor(evalId, author);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/eval/123/author', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ author }),
      });
    });

    it('should throw error when API call fails', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
      } as Response);

      const evalId = '123';
      const author = 'John Doe';

      await expect(updateEvalAuthor(evalId, author)).rejects.toThrow(
        'Failed to update eval author',
      );
    });
  });
});
