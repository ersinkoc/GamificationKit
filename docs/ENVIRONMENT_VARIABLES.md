# Environment Variables Documentation

This document describes all environment variables used by GamificationKit.

## Table of Contents

- [Application Configuration](#application-configuration)
- [API Server Configuration](#api-server-configuration)
- [Security Configuration](#security-configuration)
- [Storage Configuration](#storage-configuration)
- [WebSocket Configuration](#websocket-configuration)
- [Webhook Configuration](#webhook-configuration)
- [Metrics & Monitoring](#metrics--monitoring)
- [External Services](#external-services)
- [Secret Management](#secret-management)
- [Backup Configuration](#backup-configuration)
- [Development Settings](#development-settings)

---

## Application Configuration

### `NODE_ENV`
- **Type**: String
- **Default**: `development`
- **Required**: No
- **Values**: `development`, `production`, `test`
- **Description**: Application environment mode

### `APP_NAME`
- **Type**: String
- **Default**: `gamification-kit`
- **Required**: No
- **Description**: Application name used in logs and metrics

### `LOG_LEVEL`
- **Type**: String
- **Default**: `info`
- **Required**: No
- **Values**: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- **Description**: Logging level for the application

---

## API Server Configuration

### `API_ENABLED`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Enable/disable the built-in API server

### `API_PORT`
- **Type**: Number
- **Default**: `3001`
- **Required**: No
- **Description**: Port for the API server to listen on

### `API_HOST`
- **Type**: String
- **Default**: `0.0.0.0`
- **Required**: No
- **Description**: Host/IP for the API server to bind to

### `API_PREFIX`
- **Type**: String
- **Default**: `/gamification`
- **Required**: No
- **Description**: URL prefix for all API endpoints

### `CORS_ENABLED`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Enable CORS support

### `CORS_ORIGINS`
- **Type**: String (comma-separated)
- **Default**: `*` (all origins in development)
- **Required**: Yes (in production)
- **Example**: `http://localhost:3000,https://yourdomain.com`
- **Description**: Allowed CORS origins (whitelist)
- **⚠️ Warning**: Using `*` in production is a security risk

### `CORS_CREDENTIALS`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Allow credentials in CORS requests

### `RATE_LIMIT_WINDOW_MS`
- **Type**: Number
- **Default**: `60000` (1 minute)
- **Required**: No
- **Description**: Rate limit time window in milliseconds

### `RATE_LIMIT_MAX_REQUESTS`
- **Type**: Number
- **Default**: `100`
- **Required**: No
- **Description**: Maximum requests per window per IP

---

## Security Configuration

### `API_KEY`
- **Type**: String
- **Default**: None
- **Required**: Yes (in production)
- **Example**: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
- **Description**: API key for client authentication
- **Generation**: `openssl rand -hex 32`
- **⚠️ Security**: Store securely, never commit to version control

### `ADMIN_API_KEYS`
- **Type**: String (comma-separated)
- **Default**: None
- **Required**: Yes (if using admin endpoints)
- **Example**: `key1,key2,key3`
- **Description**: API keys for admin access (comma-separated)
- **Generation**: `openssl rand -hex 32` for each key
- **⚠️ Security**: Store securely, rotate regularly

### `ENCRYPTION_ENABLED`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Enable encryption for sensitive data

### `ENCRYPTION_KEY`
- **Type**: String (hex)
- **Default**: None
- **Required**: Yes (if ENCRYPTION_ENABLED is true)
- **Example**: `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`
- **Description**: 64-character hex string (32 bytes) for AES-256 encryption
- **Generation**: `openssl rand -hex 32`
- **⚠️ Security**: Must be exactly 64 hex characters, store securely

### `TRUST_PROXY`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Trust X-Forwarded-* headers (set to true behind nginx, load balancer)
- **⚠️ Security**: Only enable if behind a trusted proxy

---

## Storage Configuration

### `STORAGE_TYPE`
- **Type**: String
- **Default**: `memory`
- **Required**: No
- **Values**: `memory`, `redis`, `mongodb`, `postgres`
- **Description**: Storage backend type

### Redis Configuration

#### `REDIS_HOST`
- **Type**: String
- **Default**: `localhost`
- **Required**: Yes (if STORAGE_TYPE is redis)
- **Description**: Redis server hostname

#### `REDIS_PORT`
- **Type**: Number
- **Default**: `6379`
- **Required**: No
- **Description**: Redis server port

#### `REDIS_PASSWORD`
- **Type**: String
- **Default**: None
- **Required**: No
- **Description**: Redis authentication password
- **⚠️ Security**: Store securely if Redis requires authentication

#### `REDIS_DB`
- **Type**: Number
- **Default**: `0`
- **Required**: No
- **Description**: Redis database number (0-15)

#### `REDIS_TLS`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Use TLS/SSL for Redis connection

### MongoDB Configuration

#### `MONGODB_URL`
- **Type**: String
- **Default**: `mongodb://localhost:27017`
- **Required**: Yes (if STORAGE_TYPE is mongodb)
- **Description**: MongoDB connection URL

#### `MONGODB_DATABASE`
- **Type**: String
- **Default**: `gamification`
- **Required**: No
- **Description**: MongoDB database name

#### `MONGODB_USERNAME`
- **Type**: String
- **Default**: None
- **Required**: No
- **Description**: MongoDB username for authentication

#### `MONGODB_PASSWORD`
- **Type**: String
- **Default**: None
- **Required**: No
- **Description**: MongoDB password for authentication
- **⚠️ Security**: Store securely

### PostgreSQL Configuration

#### `POSTGRES_HOST`
- **Type**: String
- **Default**: `localhost`
- **Required**: Yes (if STORAGE_TYPE is postgres)
- **Description**: PostgreSQL server hostname

#### `POSTGRES_PORT`
- **Type**: Number
- **Default**: `5432`
- **Required**: No
- **Description**: PostgreSQL server port

#### `POSTGRES_DATABASE`
- **Type**: String
- **Default**: `gamification`
- **Required**: No
- **Description**: PostgreSQL database name

#### `POSTGRES_USERNAME`
- **Type**: String
- **Default**: `postgres`
- **Required**: Yes
- **Description**: PostgreSQL username

#### `POSTGRES_PASSWORD`
- **Type**: String
- **Default**: None
- **Required**: Yes
- **Description**: PostgreSQL password
- **⚠️ Security**: Store securely

#### `POSTGRES_SSL`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Use SSL for PostgreSQL connection

---

## WebSocket Configuration

### `WEBSOCKET_ENABLED`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Enable WebSocket server for real-time updates

### `WEBSOCKET_PORT`
- **Type**: Number
- **Default**: `3002`
- **Required**: No
- **Description**: WebSocket server port

### `WEBSOCKET_PATH`
- **Type**: String
- **Default**: `/ws`
- **Required**: No
- **Description**: WebSocket endpoint path

---

## Webhook Configuration

### `WEBHOOKS_ENABLED`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Enable webhook notifications

### `WEBHOOKS_TIMEOUT`
- **Type**: Number
- **Default**: `5000` (5 seconds)
- **Required**: No
- **Description**: Webhook request timeout in milliseconds

### `WEBHOOKS_RETRIES`
- **Type**: Number
- **Default**: `3`
- **Required**: No
- **Description**: Number of retry attempts for failed webhooks

### `WEBHOOKS_SECRET`
- **Type**: String
- **Default**: None
- **Required**: Yes (if webhooks are enabled)
- **Description**: Secret key for webhook signature generation
- **Generation**: `openssl rand -hex 32`
- **⚠️ Security**: Store securely

---

## Metrics & Monitoring

### `METRICS_ENABLED`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Enable metrics collection

### `METRICS_INTERVAL`
- **Type**: Number
- **Default**: `60000` (1 minute)
- **Required**: No
- **Description**: Metrics collection interval in milliseconds

### `PROMETHEUS_ENABLED`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Enable Prometheus metrics export

### `PROMETHEUS_PORT`
- **Type**: Number
- **Default**: `9090`
- **Required**: No
- **Description**: Port for Prometheus metrics endpoint

---

## External Services

### Sentry Error Tracking

#### `SENTRY_DSN`
- **Type**: String
- **Default**: None
- **Required**: No
- **Example**: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`
- **Description**: Sentry DSN for error tracking
- **⚠️ Security**: Contains project ID, but can be public

#### `SENTRY_ENVIRONMENT`
- **Type**: String
- **Default**: `production`
- **Required**: No
- **Description**: Environment name for Sentry events

### OpenTelemetry Tracing

#### `OTEL_ENABLED`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Enable OpenTelemetry tracing

#### `OTEL_EXPORTER_OTLP_ENDPOINT`
- **Type**: String
- **Default**: `http://localhost:4318`
- **Required**: No
- **Description**: OpenTelemetry collector endpoint

#### `OTEL_SERVICE_NAME`
- **Type**: String
- **Default**: `gamification-kit`
- **Required**: No
- **Description**: Service name for traces

---

## Secret Management

### HashiCorp Vault

#### `VAULT_ENABLED`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Use HashiCorp Vault for secret management

#### `VAULT_URL`
- **Type**: String
- **Default**: None
- **Required**: Yes (if VAULT_ENABLED is true)
- **Example**: `http://localhost:8200`
- **Description**: Vault server URL

#### `VAULT_TOKEN`
- **Type**: String
- **Default**: None
- **Required**: Yes (if VAULT_ENABLED is true)
- **Description**: Vault authentication token
- **⚠️ Security**: Store securely, use short-lived tokens

#### `VAULT_SECRET_PATH`
- **Type**: String
- **Default**: `secret/gamification`
- **Required**: No
- **Description**: Path to secrets in Vault

### AWS Secrets Manager

#### `AWS_SECRETS_ENABLED`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Use AWS Secrets Manager

#### `AWS_REGION`
- **Type**: String
- **Default**: `us-east-1`
- **Required**: No
- **Description**: AWS region

#### `AWS_SECRET_NAME`
- **Type**: String
- **Default**: None
- **Required**: Yes (if AWS_SECRETS_ENABLED is true)
- **Description**: Name of secret in AWS Secrets Manager

### Azure Key Vault

#### `AZURE_KEYVAULT_ENABLED`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Use Azure Key Vault

#### `AZURE_KEYVAULT_URL`
- **Type**: String
- **Default**: None
- **Required**: Yes (if AZURE_KEYVAULT_ENABLED is true)
- **Example**: `https://your-vault.vault.azure.net/`
- **Description**: Azure Key Vault URL

---

## Backup Configuration

### `BACKUP_ENABLED`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Enable automated backups

### `BACKUP_SCHEDULE`
- **Type**: String (cron expression)
- **Default**: `0 0 * * *` (daily at midnight)
- **Required**: No
- **Description**: Backup schedule in cron format

### `BACKUP_STORAGE_TYPE`
- **Type**: String
- **Default**: `s3`
- **Required**: No
- **Values**: `s3`, `gcs`, `azure`, `local`
- **Description**: Backup storage type

### S3 Backup Configuration

#### `BACKUP_S3_BUCKET`
- **Type**: String
- **Default**: None
- **Required**: Yes (if BACKUP_STORAGE_TYPE is s3)
- **Description**: S3 bucket name for backups

#### `BACKUP_S3_REGION`
- **Type**: String
- **Default**: `us-east-1`
- **Required**: No
- **Description**: S3 bucket region

#### `BACKUP_S3_ACCESS_KEY`
- **Type**: String
- **Default**: None
- **Required**: Yes (if not using IAM role)
- **Description**: AWS access key ID
- **⚠️ Security**: Store securely

#### `BACKUP_S3_SECRET_KEY`
- **Type**: String
- **Default**: None
- **Required**: Yes (if not using IAM role)
- **Description**: AWS secret access key
- **⚠️ Security**: Store securely

---

## Development Settings

### `DEBUG`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Enable debug mode (verbose logging, stack traces)

### `VERBOSE_LOGGING`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Enable verbose logging

---

## Configuration Examples

### Minimal Production Configuration

```bash
NODE_ENV=production
STORAGE_TYPE=redis
REDIS_HOST=redis.example.com
REDIS_PASSWORD=secure-password
API_KEY=your-api-key
ADMIN_API_KEYS=admin-key-1,admin-key-2
CORS_ORIGINS=https://yourdomain.com
```

### Development Configuration

```bash
NODE_ENV=development
STORAGE_TYPE=memory
DEBUG=true
CORS_ORIGINS=http://localhost:3000
```

### High-Security Production Configuration

```bash
NODE_ENV=production
STORAGE_TYPE=redis
REDIS_HOST=redis.example.com
REDIS_TLS=true
REDIS_PASSWORD=secure-password
API_KEY=your-api-key
ADMIN_API_KEYS=admin-key-1
ENCRYPTION_ENABLED=true
ENCRYPTION_KEY=your-64-char-hex-key
TRUST_PROXY=true
CORS_ORIGINS=https://yourdomain.com
WEBHOOKS_ENABLED=true
WEBHOOKS_SECRET=webhook-secret
SENTRY_DSN=https://xxx@sentry.io/xxx
PROMETHEUS_ENABLED=true
```

### Vault-Based Configuration

```bash
NODE_ENV=production
VAULT_ENABLED=true
VAULT_URL=https://vault.example.com
VAULT_TOKEN=vault-token
VAULT_SECRET_PATH=secret/gamification
STORAGE_TYPE=redis
```

---

## Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use strong, randomly generated keys** (minimum 32 bytes)
3. **Rotate secrets regularly** (API keys, encryption keys)
4. **Use environment-specific configurations** (development, staging, production)
5. **Enable encryption** for sensitive data storage
6. **Use secret management services** (Vault, AWS Secrets Manager) in production
7. **Limit CORS origins** to only trusted domains
8. **Enable TLS/SSL** for all network connections in production
9. **Use IAM roles** instead of access keys when possible (AWS, Azure)
10. **Monitor and audit** secret access

---

## Loading Environment Variables

### Option 1: .env File (Development)

```bash
# Copy example file
cp .env.example .env

# Edit with your values
nano .env

# Variables are automatically loaded
npm start
```

### Option 2: System Environment (Production)

```bash
# Export variables
export NODE_ENV=production
export API_KEY=your-key

# Or use systemd environment file
cat > /etc/gamification-kit/env <<EOF
NODE_ENV=production
API_KEY=your-key
EOF
```

### Option 3: Docker Environment

```yaml
# docker-compose.yml
services:
  gamification:
    image: gamification-kit
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production
```

### Option 4: Kubernetes Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gamification-secrets
type: Opaque
stringData:
  API_KEY: your-api-key
  REDIS_PASSWORD: redis-password
```

---

## Validation

GamificationKit validates required environment variables on startup. If critical variables are missing, the application will fail to start with a descriptive error message.

To validate your configuration:

```bash
npm run validate-config
```

---

## Support

For questions about environment configuration:
- GitHub Issues: https://github.com/ersinkoc/GamificationKit/issues
- Documentation: https://github.com/ersinkoc/GamificationKit/docs
