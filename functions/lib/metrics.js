/**
 * Metrics Collection for Cloud Functions
 *
 * Tracks function performance, error rates, and business metrics.
 * Integrates with Firebase/Google Cloud Monitoring.
 */

const { Timestamp } = require('firebase-admin/firestore');
const { defaultLogger: logger } = require('./logger');

/**
 * Metrics collector for tracking function performance
 */
class MetricsCollector {
  constructor() {
    this.metrics = new Map();
  }

  /**
   * Record a metric value
   */
  record(name, value, labels = {}) {
    const key = `${name}:${JSON.stringify(labels)}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        name,
        labels,
        values: [],
      });
    }
    this.metrics.get(key).values.push({
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Increment a counter
   */
  increment(name, labels = {}) {
    this.record(name, 1, labels);
  }

  /**
   * Record a timing metric
   */
  timing(name, durationMs, labels = {}) {
    this.record(name, durationMs, { ...labels, unit: 'ms' });
  }

  /**
   * Get all recorded metrics
   */
  getAll() {
    return Array.from(this.metrics.values());
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
  }
}

/**
 * Function execution timer
 */
class ExecutionTimer {
  constructor(functionName, labels = {}) {
    this.functionName = functionName;
    this.labels = labels;
    this.startTime = Date.now();
  }

  /**
   * End the timer and return duration
   */
  end() {
    return Date.now() - this.startTime;
  }
}

/**
 * Store metrics in Firestore for analysis
 */
async function storeMetrics(db, functionName, metrics) {
  try {
    await db.collection('guestbot_metrics').add({
      functionName,
      metrics,
      timestamp: Timestamp.now(),
    });
  } catch (error) {
    // Don't let metrics storage failures affect the main function
    logger.error('Failed to store metrics', error);
  }
}

/**
 * Track API usage by property
 */
async function trackApiUsage(db, propertyId, endpoint, success) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const docRef = db.collection('guestbot_usage').doc(`${propertyId}_${today}`);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      if (doc.exists) {
        const data = doc.data();
        transaction.update(docRef, {
          [`${endpoint}.total`]: (data[endpoint]?.total || 0) + 1,
          [`${endpoint}.success`]: (data[endpoint]?.success || 0) + (success ? 1 : 0),
          [`${endpoint}.errors`]: (data[endpoint]?.errors || 0) + (success ? 0 : 1),
          updatedAt: Timestamp.now(),
        });
      } else {
        transaction.set(docRef, {
          propertyId,
          date: today,
          [endpoint]: {
            total: 1,
            success: success ? 1 : 0,
            errors: success ? 0 : 1,
          },
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }
    });
  } catch (error) {
    // Don't let usage tracking failures affect the main function
    logger.error('Failed to track API usage', error);
  }
}

module.exports = {
  MetricsCollector,
  ExecutionTimer,
  storeMetrics,
  trackApiUsage,
};
