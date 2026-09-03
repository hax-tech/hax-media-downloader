export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private levelWeights: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  private currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

  private sanitize(data: unknown): unknown {
    if (!data) return data;
    if (typeof data === 'string') {
      return data.replace(/(api[-_]?key|token|secret|password)=([^&\s]+)/gi, '$1=[REDACTED]');
    }
    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        return data.map((item) => this.sanitize(item));
      }
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (/key|secret|token|password|auth/i.test(key)) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitize(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }
    return data;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (this.levelWeights[level] < this.levelWeights[this.currentLevel]) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context ? { context: this.sanitize(context) } : {}),
    };

    const formatted = JSON.stringify(entry);
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context);
  }
}

export const logger = new Logger();
