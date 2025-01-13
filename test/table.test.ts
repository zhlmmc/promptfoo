import chalk from 'chalk';
import { ellipsize, generateTable, wrapTable } from '../src/table';
import { ResultFailureReason, type EvaluateTable } from '../src/types';

describe('ellipsize', () => {
  it('should return the original string if its length is less than the maximum length', () => {
    const str = 'short string';
    const result = ellipsize(str, 20);
    expect(result).toBe(str);
  });

  it('should return the original string if its length is equal to the maximum length', () => {
    const str = 'exact length string';
    const result = ellipsize(str, str.length);
    expect(result).toBe(str);
  });

  it('should truncate the string and append "..." if its length exceeds the maximum length', () => {
    const str = 'this is a long string that needs to be truncated';
    const result = ellipsize(str, 10);
    expect(result).toBe('this is...');
  });
});

describe('generateTable', () => {
  const mockEvaluateTable: EvaluateTable = {
    head: {
      vars: ['Variable 1', 'Variable 2'],
      prompts: [
        { raw: 'Raw Prompt A', provider: 'Provider A', label: 'Prompt A' } as any,
        { raw: 'Raw Prompt B', provider: 'Provider B', label: 'Prompt B' } as any,
      ],
    },
    body: [
      {
        vars: ['Value 1', 'Value 2'],
        outputs: [
          {
            pass: true,
            score: 1,
            text: 'Output A',
            failureReason: ResultFailureReason.NONE,
            cost: 0,
            id: '1',
            latencyMs: 0,
            namedScores: {},
            prompt: 'Prompt A',
            testCase: { description: 'Description 1' } as any,
          },
          {
            pass: false,
            score: 0,
            text: 'Output B---details',
            failureReason: ResultFailureReason.ASSERT,
            cost: 0,
            id: '2',
            latencyMs: 0,
            namedScores: {},
            prompt: 'Prompt B',
            testCase: { description: 'Description 1' } as any,
          },
        ],
        test: { description: 'Description 1' } as any,
      },
    ],
  };

  it('should generate a table with the correct headers and data', () => {
    const table = generateTable(mockEvaluateTable);
    const output = table.toString();

    expect(output).toContain('[Provider A] Prompt A');
    expect(output).toContain('[Provider B] Prompt B');
    expect(output).toContain('Value 1');
    expect(output).toContain(chalk.green('[PASS] ') + 'Output A');
    expect(output).toContain(chalk.red('[FAIL] ') + 'Output B');
  });

  it('should truncate long cell contents based on tableCellMaxLength', () => {
    const longText = 'a'.repeat(300);
    const mockTableWithLongText: EvaluateTable = {
      ...mockEvaluateTable,
      body: [
        {
          vars: ['Value 1', 'Value 2'],
          outputs: [
            {
              pass: true,
              score: 1,
              text: longText,
              failureReason: ResultFailureReason.NONE,
              cost: 0,
              id: '5',
              latencyMs: 0,
              namedScores: {},
              prompt: 'Prompt A',
              testCase: { description: 'Description 3' } as any,
            },
          ],
          test: { description: 'Description 3' } as any,
        },
      ],
    };
    const table = generateTable(mockTableWithLongText, 50);
    const output = table.toString();

    expect(output).toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaa…');
  });

  it('should limit the number of rows based on maxRows', () => {
    const mockTableWithManyRows: EvaluateTable = {
      ...mockEvaluateTable,
      body: new Array(50).fill(mockEvaluateTable.body[0]),
    };
    const table = generateTable(mockTableWithManyRows, 250, 10);
    const output = table.toString();

    const rowCount = output.split('\n').filter((line) => line.includes('Value')).length;
    expect(rowCount).toBeLessThanOrEqual(10);
  });
});

describe('wrapTable', () => {
  it('should return a table with the correct headers and rows', () => {
    const rows = [
      { Column1: 'Row1-Value1', Column2: 'Row1-Value2' },
      { Column1: 'Row2-Value1', Column2: 'Row2-Value2' },
    ];
    const table = wrapTable(rows);
    const output = table.toString();

    expect(output).toContain('Column1');
    expect(output).toContain('Column2');
    expect(output).toContain('Row1-Value1');
    expect(output).toContain('Row2-Value2');
  });

  it('should return "No data to display" if rows are empty', () => {
    const rows: Record<string, string | number>[] = [];
    const result = wrapTable(rows);

    expect(result).toBe('No data to display');
  });

  it('should handle rows with varying column counts', () => {
    const rows: Record<string, string | number>[] = [
      { Column1: 'Row1-Value1' },
      { Column1: 'Row2-Value1', Column2: 'Row2-Value2' },
    ];
    const table = wrapTable(rows);
    const output = table.toString();

    expect(output).toContain('Column1');
    expect(output).toContain('Row2-Value2');
  });
});
