/**
 * Centralized logging system for clean, organized console output
 */

type LogLevel = 'info' | 'warn' | 'error' | 'success';

interface LogContext {
  [key: string]: unknown;
}

const colors = {
  info: '#3B82F6',    // blue
  warn: '#F59E0B',    // orange
  error: '#EF4444',   // red
  success: '#10B981', // green
};

const icons = {
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  success: '✅',
};

class Logger {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
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
}

export const createLogger = (prefix: string): Logger => new Logger(prefix);

// Common loggers
export const amazonLogger = createLogger('Amazon API');
export const aiLogger = createLogger('OpenAI');
export const adLogger = createLogger('Ads');
export const apiLogger = createLogger('API');
export const uiLogger = createLogger('UI');
