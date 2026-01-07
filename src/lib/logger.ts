/**
 * Centralized logging system for clean, organized console output
 * All errors, warnings, and info should go through here for consistency
 */

type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

const colors = {
  info: '#3B82F6',    // blue
  warn: '#F59E0B',    // orange
  error: '#EF4444',   // red
  success: '#10B981', // green
  debug: '#8B5CF6',   // purple
};

const icons = {
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  success: '✅',
  debug: '🔍',
};

class Logger {
  private prefix: string;
  private isDevelopment: boolean;

  constructor(prefix: string) {
    this.prefix = prefix;
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const icon = icons[level];
    const color = colors[level];

    console.group(
      `%c${icon} [${this.prefix}] ${message}`,
      `color: ${color}; font-weight: bold;`
    );
    console.log(`⏰ ${timestamp}`);
    
    if (context && Object.keys(context).length > 0) {
      Object.entries(context).forEach(([key, value]) => {
        console.log(`  ${key}:`, value);
      });
    }
    
    console.groupEnd();
  }

  info(message: string, context?: LogContext): void {
    this.formatMessage('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.formatMessage('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.formatMessage('error', message, context);
  }

  success(message: string, context?: LogContext): void {
    this.formatMessage('success', message, context);
  }

  debug(message: string, context?: LogContext): void {
    if (!this.isDevelopment) return; // Only log debug in development
    this.formatMessage('debug', message, context);
  }
}

export const createLogger = (prefix: string): Logger => new Logger(prefix);

// Common loggers
export const amazonLogger = createLogger('Amazon API');
export const aiLogger = createLogger('OpenAI');
export const adLogger = createLogger('Ads');
export const apiLogger = createLogger('API');
export const uiLogger = createLogger('UI');
export const productLogger = createLogger('Product');
export const authLogger = createLogger('Auth');
export const networkLogger = createLogger('Network');

// Specialized logging helpers for common error scenarios
export const logAdError = (placement: string, reason: string, details?: LogContext) => {
  adLogger.error(`Ad slot "${placement}" failed to load`, {
    placement,
    reason,
    ...details,
    fix: 'Check NEXT_PUBLIC_ADMOB_CLIENT_ID and slot ID in .env.local',
  });
};

export const logAdWarning = (placement: string, message: string, details?: LogContext) => {
  adLogger.warn(`${placement}: ${message}`, details);
};

export const logAdInfo = (placement: string, message: string) => {
  adLogger.info(`${placement}: ${message}`);
};

export const logAIError = (operation: string, reason: string, details?: LogContext & { error?: Error }) => {
  const context: LogContext = {
    operation,
    reason,
    ...details,
    possibleCauses: [
      'Invalid AI_PROVIDER_KEY',
      'AI_PROVIDER_URL incorrect',
      'Rate limiting',
      'Network connectivity',
    ],
  };
  if (details?.error) {
    context.errorMessage = details.error.message;
    context.errorStack = details.error.stack;
  }
  aiLogger.error(`AI ${operation} failed: ${reason}`, context);
};

export const logProductError = (operation: string, reason: string, details?: LogContext & { error?: Error }) => {
  const context: LogContext = {
    operation,
    reason,
    ...details,
    possibleCauses: [
      'Invalid Amazon credentials',
      'Product not found',
      'API rate limit',
      'Network error',
    ],
  };
  if (details?.error) {
    context.errorMessage = details.error.message;
    context.errorStack = details.error.stack;
  }
  productLogger.error(`Product ${operation} failed: ${reason}`, context);
};

export const logAmazonError = (operation: string, reason: string, details?: LogContext) => {
  amazonLogger.error(`Amazon API error: ${reason}`, {
    operation,
    ...details,
    checkList: [
      'AMAZON_ACCESS_KEY is set correctly',
      'AMAZON_SECRET_KEY is set correctly',
      'AMAZON_ASSOCIATE_TAG is valid',
      'API quota not exceeded',
    ],
  });
};

export const logNetworkError = (url: string, status: number, details?: LogContext) => {
  networkLogger.error(`Network request failed: ${url}`, {
    url,
    status,
    ...details,
  });
};
