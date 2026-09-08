/**
 * Supported log levels for the logging system.
 *
 * Ordered by typical severity:
 * - error: critical failures
 * - warn: non-blocking issues
 * - success: successful operations
 * - info: general runtime information
 * - debug: verbose diagnostic output
 */
export type LogType = 'error' | 'warn' | 'success' | 'info' | 'debug';
