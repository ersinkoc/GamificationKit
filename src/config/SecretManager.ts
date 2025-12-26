import * as crypto from 'crypto';
import { Logger, type LoggerOptions } from '../utils/logger.js';

export interface SecretManagerOptions {
  logger?: LoggerOptions;
  backend?: 'env' | 'vault' | 'aws' | 'azure';
  vault?: VaultConfig;
  aws?: AWSConfig;
  azure?: AzureConfig;
  cacheTTL?: number;
  autoRefresh?: boolean;
}

export interface VaultConfig {
  url?: string;
  token?: string;
  path?: string;
}

export interface AWSConfig {
  secretName?: string;
  region?: string;
}

export interface AzureConfig {
  vaultUrl?: string;
}

interface SecretEntry {
  value: string;
  timestamp: number;
}

/**
 * SecretManager handles secure loading and management of secrets
 * Supports multiple backends: Environment Variables, HashiCorp Vault, AWS Secrets Manager, Azure Key Vault
 */
export class SecretManager {
  private logger: Logger;
  private secrets: Map<string, SecretEntry>;
  private backend: 'env' | 'vault' | 'aws' | 'azure';
  private encryptionKey: Buffer | null;
  private initialized: boolean;
  private _vaultConfig: VaultConfig;
  private _awsConfig: AWSConfig;
  private _azureConfig: AzureConfig;
  private cacheTTL: number;
  private _autoRefresh: boolean;

  constructor(options: SecretManagerOptions = {}) {
    this.logger = new Logger({ prefix: 'SecretManager', ...options.logger });
    this.secrets = new Map();
    this.backend = options.backend || 'env';
    this.encryptionKey = null;
    this.initialized = false;

    // Backend configurations
    this._vaultConfig = options.vault || {};
    this._awsConfig = options.aws || {};
    this._azureConfig = options.azure || {};

    // Cache settings
    this.cacheTTL = options.cacheTTL || 300000; // 5 minutes
    this._autoRefresh = options.autoRefresh !== false;
  }

  /**
   * Initialize the secret manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info(`Initializing SecretManager with backend: ${this.backend}`);

    try {
      // Initialize encryption key if encryption is enabled
      if (process.env.ENCRYPTION_ENABLED === 'true') {
        await this.initializeEncryptionKey();
      }

      // Initialize backend
      switch (this.backend) {
        case 'vault':
          await this.initializeVault();
          break;
        case 'aws':
          await this.initializeAWS();
          break;
        case 'azure':
          await this.initializeAzure();
          break;
        case 'env':
        default:
          await this.initializeEnv();
          break;
      }

      this.initialized = true;
      this.logger.info('SecretManager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SecretManager', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Initialize encryption key from environment
   */
  private async initializeEncryptionKey(): Promise<void> {
    const encryptionKey = process.env.ENCRYPTION_KEY;

    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY is required when ENCRYPTION_ENABLED is true');
    }

    // Validate key length (must be 32 bytes for AES-256)
    if (encryptionKey.length !== 64) { // 32 bytes = 64 hex characters
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256');
    }

    this.encryptionKey = Buffer.from(encryptionKey, 'hex');
    this.logger.info('Encryption key initialized');
  }

  /**
   * Initialize environment variable backend
   */
  private async initializeEnv(): Promise<void> {
    this.logger.info('Using environment variables for secrets');

    // Load all secrets from environment
    const secretKeys = [
      'API_KEY',
      'ADMIN_API_KEYS',
      'ENCRYPTION_KEY',
      'REDIS_PASSWORD',
      'MONGODB_PASSWORD',
      'POSTGRES_PASSWORD',
      'WEBHOOKS_SECRET',
      'SENTRY_DSN',
      'VAULT_TOKEN',
      'AWS_SECRET_ACCESS_KEY',
      'BACKUP_S3_SECRET_KEY'
    ];

    for (const key of secretKeys) {
      const value = process.env[key];
      if (value) {
        this.secrets.set(key, {
          value,
          timestamp: Date.now()
        });
      }
    }

    this.logger.info(`Loaded ${this.secrets.size} secrets from environment`);
  }

  /**
   * Initialize HashiCorp Vault backend
   */
  private async initializeVault(): Promise<void> {
    if (!process.env.VAULT_ENABLED || process.env.VAULT_ENABLED !== 'true') {
      throw new Error('Vault is not enabled');
    }

    const vaultUrl = process.env.VAULT_URL;
    const vaultToken = process.env.VAULT_TOKEN;
    const vaultPath = process.env.VAULT_SECRET_PATH || 'secret/gamification';

    if (!vaultUrl || !vaultToken) {
      throw new Error('VAULT_URL and VAULT_TOKEN are required for Vault backend');
    }

    this.logger.info(`Connecting to Vault at ${vaultUrl}`);

    try {
      // Fetch secrets from Vault
      const response = await fetch(`${vaultUrl}/v1/${vaultPath}`, {
        method: 'GET',
        headers: {
          'X-Vault-Token': vaultToken
        }
      });

      if (!response.ok) {
        throw new Error(`Vault request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      const secrets = data.data?.data || data.data;

      // Store secrets
      for (const [key, value] of Object.entries(secrets)) {
        this.secrets.set(key, {
          value: String(value),
          timestamp: Date.now()
        });
      }

      this.logger.info(`Loaded ${this.secrets.size} secrets from Vault`);
    } catch (error) {
      this.logger.error('Failed to load secrets from Vault', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Initialize AWS Secrets Manager backend
   */
  private async initializeAWS(): Promise<void> {
    if (!process.env.AWS_SECRETS_ENABLED || process.env.AWS_SECRETS_ENABLED !== 'true') {
      throw new Error('AWS Secrets Manager is not enabled');
    }

    const secretName = process.env.AWS_SECRET_NAME;
    const region = process.env.AWS_REGION || 'us-east-1';

    if (!secretName) {
      throw new Error('AWS_SECRET_NAME is required for AWS Secrets Manager backend');
    }

    this.logger.info(`Loading secrets from AWS Secrets Manager: ${secretName}`);

    try {
      // Note: This requires AWS SDK to be installed
      // For now, we'll throw an error indicating the SDK is needed
      throw new Error('AWS Secrets Manager support requires aws-sdk package. Install with: npm install @aws-sdk/client-secrets-manager');

      // Implementation would look like:
      // const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
      // const client = new SecretsManagerClient({ region });
      // const command = new GetSecretValueCommand({ SecretId: secretName });
      // const response = await client.send(command);
      // const secrets = JSON.parse(response.SecretString);
      // Store secrets...
    } catch (error) {
      this.logger.error('Failed to load secrets from AWS', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Initialize Azure Key Vault backend
   */
  private async initializeAzure(): Promise<void> {
    if (!process.env.AZURE_KEYVAULT_ENABLED || process.env.AZURE_KEYVAULT_ENABLED !== 'true') {
      throw new Error('Azure Key Vault is not enabled');
    }

    const vaultUrl = process.env.AZURE_KEYVAULT_URL;

    if (!vaultUrl) {
      throw new Error('AZURE_KEYVAULT_URL is required for Azure Key Vault backend');
    }

    this.logger.info(`Loading secrets from Azure Key Vault: ${vaultUrl}`);

    try {
      // Note: This requires Azure SDK to be installed
      throw new Error('Azure Key Vault support requires @azure/keyvault-secrets package. Install with: npm install @azure/keyvault-secrets @azure/identity');

      // Implementation would look like:
      // const { SecretClient } = await import('@azure/keyvault-secrets');
      // const { DefaultAzureCredential } = await import('@azure/identity');
      // const credential = new DefaultAzureCredential();
      // const client = new SecretClient(vaultUrl, credential);
      // Load and store secrets...
    } catch (error) {
      this.logger.error('Failed to load secrets from Azure', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get a secret value
   */
  getSecret(key: string, defaultValue: string | null = null): string | null {
    const secret = this.secrets.get(key);

    if (!secret) {
      this.logger.debug(`Secret not found: ${key}`);
      return defaultValue;
    }

    // Check if secret has expired (for cached secrets)
    if (this.cacheTTL > 0) {
      const age = Date.now() - secret.timestamp;
      if (age > this.cacheTTL) {
        this.logger.debug(`Secret expired: ${key}`);
        this.secrets.delete(key);
        return defaultValue;
      }
    }

    return secret.value;
  }

  /**
   * Set a secret value
   */
  setSecret(key: string, value: string): void {
    this.secrets.set(key, {
      value,
      timestamp: Date.now()
    });
    this.logger.debug(`Secret updated: ${key}`);
  }

  /**
   * Check if a secret exists
   */
  hasSecret(key: string): boolean {
    return this.secrets.has(key);
  }

  /**
   * Encrypt a value using the encryption key
   */
  encrypt(value: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption is not enabled');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return: iv + authTag + encrypted (all in hex)
    return iv.toString('hex') + authTag.toString('hex') + encrypted;
  }

  /**
   * Decrypt a value using the encryption key
   */
  decrypt(encryptedValue: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption is not enabled');
    }

    try {
      // Extract iv (32 chars), authTag (32 chars), and encrypted data
      const iv = Buffer.from(encryptedValue.slice(0, 32), 'hex');
      const authTag = Buffer.from(encryptedValue.slice(32, 64), 'hex');
      const encrypted = encryptedValue.slice(64);

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('Failed to decrypt value');
    }
  }

  /**
   * Mask a secret for logging (show only first/last 4 characters)
   */
  static maskSecret(secret: string): string {
    if (!secret || secret.length < 8) {
      return '***';
    }
    return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
  }

  /**
   * Validate required secrets are present
   */
  validateRequiredSecrets(requiredSecrets: string[]): void {
    const missing: string[] = [];

    for (const key of requiredSecrets) {
      if (!this.hasSecret(key) && !process.env[key]) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required secrets: ${missing.join(', ')}`);
    }
  }

  /**
   * Refresh secrets from backend
   */
  async refresh(): Promise<void> {
    this.logger.info('Refreshing secrets from backend');
    this.secrets.clear();
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Clear all secrets from memory
   */
  clear(): void {
    this.secrets.clear();
    this.encryptionKey = null;
    this.initialized = false;
    this.logger.info('Secrets cleared from memory');
  }

  /**
   * Get secrets for configuration (with masking for logs)
   */
  getSecretsForConfig(): Record<string, string> {
    const config: Record<string, string> = {};
    const keys = Array.from(this.secrets.keys());

    for (const key of keys) {
      const secret = this.getSecret(key);
      config[key] = SecretManager.maskSecret(secret || '');
    }

    return config;
  }
}
