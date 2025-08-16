import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadKGConfig, isGitHubEnabled, getGitHubToken, getStoragePath, getMCPCaptureConfig } from '../config/KGConfig.js';

describe('KGConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
    
    // Explicitly clear PKG environment variables to ensure clean test state
    delete process.env.PKG_STORAGE_DIR;
    delete process.env.PKG_GITHUB_INTEGRATION_ENABLED;
    delete process.env.PKG_GITHUB_TOKEN;
    delete process.env.PKG_MCP_CAPTURE_ENABLED;
    delete process.env.PKG_MCP_CAPTURE_TOOLS;
    delete process.env.PKG_MCP_CAPTURE_EXCLUDE;
    delete process.env.PKG_MCP_CAPTURE_AUTO;
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('loadKGConfig', () => {
    it('should load default configuration when no environment variables are set', () => {
      const config = loadKGConfig();
      
      expect(config.storage?.path).toBe('.kg');
      expect(config.github?.enabled).toBe(false);
      expect(config.github?.token).toBeUndefined();
      expect(config.mcp?.capture?.enabled).toBe(true);
      expect(config.mcp?.capture?.tools).toEqual(['github']);
      expect(config.mcp?.capture?.exclude).toEqual([]);
      expect(config.mcp?.capture?.autoCapture).toBe(true);
    });

    it('should load configuration from environment variables', () => {
      process.env.PKG_STORAGE_DIR = 'custom-storage';
      process.env.PKG_GITHUB_INTEGRATION_ENABLED = 'true';
      process.env.PKG_GITHUB_TOKEN = 'test-token';
      process.env.PKG_MCP_CAPTURE_ENABLED = 'false';
      process.env.PKG_MCP_CAPTURE_TOOLS = 'obsidian,notion';
      process.env.PKG_MCP_CAPTURE_EXCLUDE = 'sensitive-tool';
      process.env.PKG_MCP_CAPTURE_AUTO = 'false';

      const config = loadKGConfig();
      
      expect(config.storage?.path).toBe('custom-storage');
      expect(config.github?.enabled).toBe(true);
      expect(config.github?.token).toBe('test-token');
      expect(config.mcp?.capture?.enabled).toBe(false);
      expect(config.mcp?.capture?.tools).toEqual(['obsidian', 'notion']);
      expect(config.mcp?.capture?.exclude).toEqual(['sensitive-tool']);
      expect(config.mcp?.capture?.autoCapture).toBe(false);
    });

    it('should disable GitHub integration when no token is provided even if enabled flag is set', () => {
      process.env.PKG_GITHUB_INTEGRATION_ENABLED = 'true';
      // No PKG_GITHUB_TOKEN set

      const config = loadKGConfig();
      
      expect(config.github?.enabled).toBe(false);
      expect(config.github?.token).toBeUndefined();
    });

    it('should enable GitHub integration when both enabled flag and token are provided', () => {
      process.env.PKG_GITHUB_INTEGRATION_ENABLED = 'true';
      process.env.PKG_GITHUB_TOKEN = 'test-token';

      const config = loadKGConfig();
      
      expect(config.github?.enabled).toBe(true);
      expect(config.github?.token).toBe('test-token');
    });
  });

  describe('isGitHubEnabled', () => {
    it('should return false by default', () => {
      expect(isGitHubEnabled()).toBe(false);
    });

    it('should return true when GitHub integration is properly configured', () => {
      process.env.PKG_GITHUB_INTEGRATION_ENABLED = 'true';
      process.env.PKG_GITHUB_TOKEN = 'test-token';
      
      expect(isGitHubEnabled()).toBe(true);
    });

    it('should return false when no token is provided', () => {
      process.env.PKG_GITHUB_INTEGRATION_ENABLED = 'true';
      // No token set
      
      expect(isGitHubEnabled()).toBe(false);
    });
  });

  describe('getGitHubToken', () => {
    it('should return undefined by default', () => {
      expect(getGitHubToken()).toBeUndefined();
    });

    it('should return token when set', () => {
      process.env.PKG_GITHUB_TOKEN = 'test-token';
      
      expect(getGitHubToken()).toBe('test-token');
    });
  });

  describe('getStoragePath', () => {
    it('should return default path when not configured', () => {
      expect(getStoragePath()).toBe('.kg');
    });

    it('should return configured path', () => {
      process.env.PKG_STORAGE_DIR = 'custom-storage';
      
      expect(getStoragePath()).toBe('custom-storage');
    });
  });

  describe('getMCPCaptureConfig', () => {
    it('should return default MCP capture configuration', () => {
      const config = getMCPCaptureConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.tools).toEqual(['github']);
      expect(config.exclude).toEqual([]);
      expect(config.autoCapture).toBe(true);
    });

    it('should return configured MCP capture configuration', () => {
      process.env.PKG_MCP_CAPTURE_ENABLED = 'false';
      process.env.PKG_MCP_CAPTURE_TOOLS = 'obsidian,notion';
      process.env.PKG_MCP_CAPTURE_EXCLUDE = 'sensitive-tool';
      process.env.PKG_MCP_CAPTURE_AUTO = 'false';

      const config = getMCPCaptureConfig();
      
      expect(config.enabled).toBe(false);
      expect(config.tools).toEqual(['obsidian', 'notion']);
      expect(config.exclude).toEqual(['sensitive-tool']);
      expect(config.autoCapture).toBe(false);
    });
  });
});
