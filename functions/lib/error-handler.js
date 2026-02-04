/**
 * Error Handling Utilities
 *
 * Provides consistent error handling, formatting, and reporting
 * across all Cloud Functions.
 */

const { createRequestLogger } = require('./logger');

/**
 * Custom error classes for different error types
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Permission denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Map of user-friendly error messages
 * Internal errors should never expose implementation details
 */
const USER_FRIENDLY_MESSAGES = {
  VALIDATION_ERROR: 'Please check your input and try again.',
  AUTHENTICATION_ERROR: 'Please sign in to continue.',
  AUTHORIZATION_ERROR: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong. Please try again later.',
};

/**
 * Format error for API response
 * Never expose internal error details to clients
 */
function formatErrorResponse(error) {
  const isOperational = error instanceof AppError && error.isOperational;

  return {
    success: false,
    error: {
      code: isOperational ? error.code : 'INTERNAL_ERROR',
      message: isOperational ? error.message : USER_FRIENDLY_MESSAGES.INTERNAL_ERROR,
    },
  };
}

/**
 * Express-style error handler middleware
 */
function errorHandler(err, req, res, logger = null) {
  const log = logger || createRequestLogger(req);

  // Log the full error for debugging
  if (err instanceof AppError && err.isOperational) {
    log.warn('Operational error', {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
    });
  } else {
    log.error('Unexpected error', err, {
      url: req.url,
      method: req.method,
    });
  }

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;

  // Send response
  res.status(statusCode).json(formatErrorResponse(err));
}

/**
 * Async handler wrapper to catch errors in async functions
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      errorHandler(err, req, res);
    });
  };
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  formatErrorResponse,
  errorHandler,
  asyncHandler,
  USER_FRIENDLY_MESSAGES,
};
