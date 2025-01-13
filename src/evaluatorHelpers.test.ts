import fs from 'fs';
import path from 'path';
import * as cliState from './cliState';
import { extractTextFromPDF, resolveVariables, renderPrompt } from './evaluatorHelpers';
import { isJavascriptFile } from './util/file';
import * as templates from './util/templates';

jest.mock('fs');
jest.mock('js-yaml');
jest.mock('./util/file');
jest.mock('./python/pythonUtils');
jest.mock('./providers/packageParser');
jest.mock('./cliState');
jest.mock('./util/templates');
jest.mock('./esm');
jest.mock('./logger');

describe('extractTextFromPDF', () => {
  let mockPDFParser: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockPDFParser = jest.fn();
    jest.doMock('pdf-parse', () => mockPDFParser);
  });

  it('should extract text from a valid PDF file', async () => {
    mockPDFParser.mockResolvedValue({ text: 'Extracted text' });
    jest.mocked(fs.readFileSync).mockReturnValue(Buffer.from('PDF content'));

    const result = await extractTextFromPDF('test.pdf');
    expect(result).toBe('Extracted text');
    expect(mockPDFParser).toHaveBeenCalledWith(Buffer.from('PDF content'));
  });

  it('should throw an error if pdf-parse module is not installed', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue(Buffer.from('PDF content'));
    mockPDFParser.mockImplementation(() => {
      throw new Error("Cannot find module 'pdf-parse'");
    });

    await expect(extractTextFromPDF('test.pdf')).rejects.toThrow(
      'pdf-parse is not installed. Please install it with: npm install pdf-parse',
    );
  });

  it('should throw an error if PDF parsing fails', async () => {
    mockPDFParser.mockRejectedValue(new Error('Parsing error'));
    jest.mocked(fs.readFileSync).mockReturnValue(Buffer.from('PDF content'));

    await expect(extractTextFromPDF('test.pdf')).rejects.toThrow(
      'Failed to extract text from PDF test.pdf: Parsing error',
    );
    expect(mockPDFParser).toHaveBeenCalledWith(Buffer.from('PDF content'));
  });
});

describe('resolveVariables', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve variables in the object', () => {
    const variables = {
      var1: 'value1',
      var2: '{{ var1 }}',
      var3: '{{ var2 }}',
    };

    const resolved = resolveVariables(variables);
    expect(resolved).toEqual({
      var1: 'value1',
      var2: 'value1',
      var3: 'value1',
    });
  });

  it('should not resolve undefined variables', () => {
    const variables = {
      var1: 'value1',
      var2: '{{ var3 }}',
    };

    const resolved = resolveVariables(variables);
    expect(resolved).toEqual({
      var1: 'value1',
      var2: '{{ var3 }}',
    });
  });

  it('should handle circular references gracefully', () => {
    const variables = {
      var1: '{{ var2 }}',
      var2: '{{ var1 }}',
    };

    const resolved = resolveVariables(variables);
    expect(resolved).toEqual({
      var1: '{{ var1 }}',
      var2: '{{ var1 }}',
    });
  });
});

describe('renderPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render a prompt with variables', async () => {
    const mockNunjucksEngine = {
      renderString: jest.fn().mockReturnValue('Rendered prompt'),
    } as unknown as ReturnType<typeof templates.getNunjucksEngine>;
    jest.mocked(templates.getNunjucksEngine).mockReturnValue(mockNunjucksEngine);

    const prompt = { raw: 'Hello, {{ name }}!', label: 'test-prompt' };
    const vars = { name: 'World' };

    const result = await renderPrompt(prompt, vars);

    expect(result).toBe('Rendered prompt');
    expect(mockNunjucksEngine.renderString).toHaveBeenCalledWith('Hello, {{ name }}!', vars);
  });

  it('should load variables from a file', async () => {
    (cliState.default as any).basePath = '';
    jest.mocked(fs.readFileSync).mockReturnValue('File content');
    jest.mocked(isJavascriptFile).mockReturnValue(false);

    const prompt = { raw: 'Prompt with file', label: 'test-prompt' };
    const vars = { fileVar: 'file://test.txt' };

    const result = await renderPrompt(prompt, vars);

    expect(vars.fileVar).toBe('File content');
    expect(result).toBe('Rendered prompt');
    expect(fs.readFileSync).toHaveBeenCalledWith(
      path.resolve(process.cwd(), '', 'test.txt'),
      'utf8',
    );
  });

  it('should throw an error for unsupported file types', async () => {
    jest.mocked(isJavascriptFile).mockReturnValue(false);
    jest.mocked(fs.readFileSync).mockReturnValue('Unsupported content');

    const prompt = { raw: 'Prompt with unsupported file', label: 'test-prompt' };
    const vars = { unsupportedVar: 'file://test.unsupported' };

    jest.mocked(templates.getNunjucksEngine).mockReturnValue({
      renderString: jest.fn().mockReturnValue('Rendered prompt'),
    } as any);

    jest.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Unsupported file type');
    });

    await expect(renderPrompt(prompt, vars)).rejects.toThrow('Unsupported file type');
  });

  it('should handle external integrations', async () => {
    const mockIntegration = jest.fn().mockResolvedValue({ messages: 'Integration result' });
    jest.doMock('./integrations/portkey', () => ({ getPrompt: mockIntegration }), {
      virtual: true,
    });

    const prompt = { raw: 'portkey://integration', label: 'test-prompt' };
    const vars = {};

    const result = await renderPrompt(prompt, vars);

    expect(result).toBe(JSON.stringify('Integration result'));
    expect(mockIntegration).toHaveBeenCalled();
  });

  it('should resolve variables before rendering', async () => {
    const mockNunjucksEngine = {
      renderString: jest.fn().mockReturnValue('Resolved and rendered'),
    } as unknown as ReturnType<typeof templates.getNunjucksEngine>;
    jest.mocked(templates.getNunjucksEngine).mockReturnValue(mockNunjucksEngine);

    const prompt = { raw: 'Hello, {{ name }}!', label: 'test-prompt' };
    const vars = { name: '{{ greeting }}', greeting: 'World' };

    const result = await renderPrompt(prompt, vars);

    expect(result).toBe('Resolved and rendered');
    expect(mockNunjucksEngine.renderString).toHaveBeenCalledWith('Hello, {{ name }}!', {
      name: 'World',
      greeting: 'World',
    });
  });
});
