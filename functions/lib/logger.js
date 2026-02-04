/**
 * Structured Logger for Cloud Functions
 *
 * Provides consistent, structured logging that integrates with
 * Google Cloud Logging and can be queried/filtered easily.
 */

const { logger } = require('firebase-functions');

/**
 * Log levels following severity standards
 */
const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
};

/**
 * Create a structured log entry
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 */
function createLogEntry(level, message, context = {}) {
  const entry = {
    severity: level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  // Add request ID if available
  if (context.requestId) {
    entry.labels = { requestId: context.requestId };
  }

  return entry;
}

/**
 * Structured logger with context support
 */
class Logger {
  constructor(context = {}) {
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext) {
    return new Logger({ ...this.context, ...additionalContext });
  }

  debug(message, data = {}) {
    const entry = createLogEntry(LogLevel.DEBUG, message, { ...this.context, ...data });
    logger.debug(entry);
  }

  info(message, data = {}) {
    const entry = createLogEntry(LogLevel.INFO, message, { ...this.context, ...data });
    logger.info(entry);
  }

  warn(message, data = {}) {
    const entry = createLogEntry(LogLevel.WARNING, message, { ...this.context, ...data });
    logger.warn(entry);
  }

  error(message, error = null, data = {}) {
    const entry = createLogEntry(LogLevel.ERROR, message, {
      ...this.context,
      ...data,
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      }),
    });
    logger.error(entry);
  }

  critical(message, error = null, data = {}) {
    const entry = createLogEntry(LogLevel.CRITICAL, message, {
      ...this.context,
      ...data,
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      }),
    });
    logger.error(entry); // Firebase doesn't have critical, use error
  }

  /**
   * Log an HTTP request
   */
  httpRequest(req, res, durationMs) {
    this.info('HTTP Request', {
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl || req.url,
        status: res.statusCode,
        userAgent: req.headers['user-agent'],
        remoteIp: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
        latency: `${durationMs}ms`,
      },
    });
  }

  /**
   * Log a function execution
   */
  functionExecution(functionName, status, durationMs, data = {}) {
    this.info(`Function ${functionName} ${status}`, {
      function: functionName,
      status,
      executionTime: durationMs,
      ...data,
    });
  }
}

/**
 * Create a request-scoped logger
 */
function createRequestLogger(req) {
  const requestId =
    req.headers['x-request-id'] ||
    req.headers['x-cloud-trace-context']?.split('/')[0] ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return new Logger({
    requestId,
    function: req.path?.replace(/^\//, '') || 'unknown',
  });
}

module.exports = {
  Logger,
  LogLevel,
  createRequestLogger,
  defaultLogger: new Logger(),
};
