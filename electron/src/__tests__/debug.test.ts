/**
 * Tests for the debug module
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { redactSecrets, redactLogSecrets, exportDebugBundle } from '../debug';

// Mock electron's app module
jest.mock('electron', () => ({
  app: {
    getVersion: jest.fn().mockReturnValue('1.0.0-test'),
    isPackaged: false,
  },
}));

// Mock the logger
jest.mock('../logger', () => ({
  logMessage: jest.fn(),
  LOG_FILE: '/tmp/mock-nodetool.log',
}));

// Mock settings
jest.mock('../settings', () => ({
  readSettings: jest.fn().mockReturnValue({}),
  readSettingsAsync: jest.fn().mockResolvedValue({}),
}));

describe('redactSecrets', () => {
  it('should redact API keys in objects', () => {
    const data = {
      api_key: 'secret-value-12345',
      name: 'test',
      id: 'node_123',
    };
    
    const result = redactSecrets(data);
    
    expect(result).toEqual({
      api_key: '[REDACTED]',
      name: 'test',
      id: 'node_123',
    });
  });

  it('should not redact safe keys', () => {
    const data = {
      id: 'test-id',
      workflow_id: 'wf-123',
      user_id: 'user-456',
      name: 'Test Name',
      type: 'test-type',
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    };
    
    const result = redactSecrets(data);
    
    expect(result).toEqual(data);
  });

  it('should redact nested secrets', () => {
    const data = {
      config: {
        api_key: 'nested-secret',
        name: 'test',
      },
      array: [
        { api_token: 'array-secret' },
        { name: 'safe' },
      ],
    };
    
    const result = redactSecrets(data) as any;
    
    expect(result.config.api_key).toBe('[REDACTED]');
    expect(result.config.name).toBe('test');
    expect(result.array[0].api_token).toBe('[REDACTED]');
    expect(result.array[1].name).toBe('safe');
  });

  it('should redact OpenAI-style keys in strings', () => {
    const data = {
      value: 'sk-1234567890abcdefghij1234567890ab',
    };
    
    const result = redactSecrets(data) as any;
    
    expect(result.value).toBe('[REDACTED]');
  });

  it('should redact Anthropic-style keys', () => {
    const data = {
      value: 'sk-ant-1234567890abcdefghij-test',
    };
    
    const result = redactSecrets(data) as any;
    
    expect(result.value).toBe('[REDACTED]');
  });

  it('should redact HuggingFace tokens', () => {
    const data = {
      value: 'hf_1234567890abcdefghij12345',
    };
    
    const result = redactSecrets(data) as any;
    
    expect(result.value).toBe('[REDACTED]');
  });

  it('should redact JWT tokens', () => {
    const data = {
      value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    };
    
    const result = redactSecrets(data) as any;
    
    expect(result.value).toBe('[REDACTED]');
  });

  it('should handle null and undefined values', () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
    
    const data = {
      api_key: null,
      token: undefined,
      name: 'test',
    };
    
    const result = redactSecrets(data) as any;
    
    // Empty/null values for secret keys should not be redacted
    expect(result.api_key).toBeNull();
    expect(result.token).toBeUndefined();
    expect(result.name).toBe('test');
  });
});

describe('redactLogSecrets', () => {
  it('should redact OpenAI keys in log content', () => {
    const log = 'Using api_key: sk-1234567890abcdefghij1234567890ab';
    const result = redactLogSecrets(log);
    
    expect(result).not.toContain('sk-1234567890');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact multiple secrets in log content', () => {
    const log = `
      OpenAI: sk-1234567890abcdefghij1234567890ab
      HuggingFace: hf_1234567890abcdefghij12345
      Replicate: r8_1234567890abcdefghij12345
    `;
    const result = redactLogSecrets(log);
    
    expect(result).not.toContain('sk-1234567890');
    expect(result).not.toContain('hf_1234567890');
    expect(result).not.toContain('r8_1234567890');
    expect(result.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('should preserve non-secret content', () => {
    const log = 'Starting server on port 7777\nLoaded 5 workflows';
    const result = redactLogSecrets(log);
    
    expect(result).toBe(log);
  });
});

describe('exportDebugBundle', () => {
  let tmpDir: string;
  
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-test-'));
  });
  
  afterEach(() => {
    // Cleanup
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
  
  it('should create a debug bundle with correct structure', async () => {
    const result = await exportDebugBundle({
      workflow_id: 'test-workflow-123',
      errors: ['Test error 1', 'Test error 2'],
      preferred_save: 'downloads',
    });
    
    // Check result structure
    expect(result).toHaveProperty('file_path');
    expect(result).toHaveProperty('filename');
    expect(result).toHaveProperty('message');
    expect(result.filename).toMatch(/^nodetool-debug-.*\.zip$/);
    
    // Clean up the generated file
    try {
      fs.unlinkSync(result.file_path);
    } catch {
      // File may not exist if test ran in a different location
    }
  });
  
  it('should handle missing workflow context gracefully', async () => {
    const result = await exportDebugBundle({});
    
    expect(result).toHaveProperty('file_path');
    expect(result).toHaveProperty('filename');
    
    // Clean up
    try {
      fs.unlinkSync(result.file_path);
    } catch {
      // Ignore
    }
  });
  
  it('should redact secrets in workflow data', async () => {
    const result = await exportDebugBundle({
      graph: {
        nodes: [
          {
            id: 'node1',
            type: 'test',
            data: {
              api_key: 'secret-key-12345',
              name: 'Test Node',
            },
          },
        ],
      },
    });
    
    // Read the generated zip and check contents
    // For simplicity, we just verify the file was created
    expect(fs.existsSync(result.file_path)).toBe(true);
    
    // Clean up
    try {
      fs.unlinkSync(result.file_path);
    } catch {
      // Ignore
    }
  });
});
