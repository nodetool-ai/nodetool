/**
 * Error categorization and suggestion utilities for NodeTool.
 * Provides error severity levels, categorization, and helpful suggestions.
 */

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  CRITICAL = "critical"
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  CONFIGURATION = "configuration",
  AUTHENTICATION = "authentication",
  NETWORK = "network",
  VALIDATION = "validation",
  RESOURCE = "resource",
  FILE_ACCESS = "file_access",
  MISSING_DEPENDENCY = "missing_dependency",
  GENERIC = "generic"
}

/**
 * Suggested action for resolving an error
 */
export interface ErrorSuggestion {
  /** The action to take */
  action: string;
  /** Explanation of why this action helps */
  reason?: string;
  /** Optional link to documentation */
  docLink?: string;
}

/**
 * A categorized error with metadata
 */
export interface CategorizedError {
  /** The original error object or message */
  error: Error | string | Record<string, unknown>;
  /** Severity level of the error */
  severity: ErrorSeverity;
  /** Category of the error */
  category: ErrorCategory;
  /** Human-readable title for the error */
  title: string;
  /** Suggested actions to resolve the error */
  suggestions: ErrorSuggestion[];
}

/**
 * Pattern matching rules for error categorization
 */
interface ErrorPattern {
  /** Regex or string to match in error message */
  pattern: RegExp | string;
  /** Category to assign if pattern matches */
  category: ErrorCategory;
  /** Severity level for this error type */
  severity: ErrorSeverity;
  /** Title for this error type */
  title: string;
  /** Suggested actions */
  suggestions: ErrorSuggestion[];
}

/**
 * Error patterns for common errors
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Authentication errors
  {
    pattern: /(?:unauthorized|authentication|auth|api[_-]?key|invalid[_-]?token|401)/i,
    category: ErrorCategory.AUTHENTICATION,
    severity: ErrorSeverity.ERROR,
    title: "Authentication Error",
    suggestions: [
      {
        action: "Verify your API keys are configured correctly",
        reason: "The service cannot authenticate your request"
      },
      {
        action: "Check if your API key has expired",
        reason: "API keys often have expiration dates"
      },
      {
        action: "Ensure the required API keys are set in settings",
        docLink: "/settings#api-keys"
      }
    ]
  },
  // Network errors
  {
    pattern: /(?:network|connection|timeout|econnrefused|fetch|network error)/i,
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.WARNING,
    title: "Network Error",
    suggestions: [
      {
        action: "Check your internet connection",
        reason: "The request failed to reach the server"
      },
      {
        action: "Verify the service is available",
        reason: "The external service might be down"
      },
      {
        action: "Try again in a moment",
        reason: "Temporary network issues can resolve automatically"
      }
    ]
  },
  // File access errors
  {
    pattern: /(?:file not found|no such file|cannot open|permission denied|access denied)/i,
    category: ErrorCategory.FILE_ACCESS,
    severity: ErrorSeverity.ERROR,
    title: "File Access Error",
    suggestions: [
      {
        action: "Verify the file path is correct",
        reason: "The file may have been moved or deleted"
      },
      {
        action: "Check file permissions",
        reason: "You may not have permission to access this file"
      },
      {
        action: "Ensure the file exists in your workspace",
        reason: "The file needs to be uploaded to your workspace"
      }
    ]
  },
  // Resource limit errors
  {
    pattern: /(?:out of memory|oom|memory limit|resource limit|quota|cpu|gpu)/i,
    category: ErrorCategory.RESOURCE,
    severity: ErrorSeverity.CRITICAL,
    title: "Resource Limit Error",
    suggestions: [
      {
        action: "Reduce the input size or resolution",
        reason: "Processing large files requires more memory"
      },
      {
        action: "Close other applications",
        reason: "Free up system resources"
      },
      {
        action: "Upgrade your plan for higher resource limits",
        docLink: "/pricing"
      }
    ]
  },
  // Missing model errors
  {
    pattern: /(?:model not found|model.*not.*available|download.*model|missing.*model)/i,
    category: ErrorCategory.MISSING_DEPENDENCY,
    severity: ErrorSeverity.ERROR,
    title: "Model Not Found",
    suggestions: [
      {
        action: "Select a different model from the available options",
        reason: "The requested model is not installed or available"
      },
      {
        action: "Check if the model name is spelled correctly",
        reason: "Model names are case-sensitive"
      },
      {
        action: "Download the required model",
        docLink: "/models"
      }
    ]
  },
  // Validation errors
  {
    pattern: /(?:validation|invalid|malformed|bad request|400)/i,
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.WARNING,
    title: "Validation Error",
    suggestions: [
      {
        action: "Check that all required fields are filled",
        reason: "Some required parameters are missing"
      },
      {
        action: "Verify the input format is correct",
        reason: "The data format may not match expectations"
      },
      {
        action: "Review the node documentation for requirements",
        reason: "This node may have specific input requirements"
      }
    ]
  },
  // Configuration errors
  {
    pattern: /(?:configuration|config|setting|not configured|setup required)/i,
    category: ErrorCategory.CONFIGURATION,
    severity: ErrorSeverity.WARNING,
    title: "Configuration Error",
    suggestions: [
      {
        action: "Complete the setup for this node",
        reason: "This node requires initial configuration"
      },
      {
        action: "Check your settings",
        docLink: "/settings"
      },
      {
        action: "Review the node documentation",
        reason: "Configuration steps may be documented there"
      }
    ]
  }
];

/**
 * Default suggestions for generic errors
 */
const GENERIC_SUGGESTIONS: ErrorSuggestion[] = [
  {
    action: "Check the node logs for more details",
    reason: "Additional error information may be available"
  },
  {
    action: "Try refreshing the page",
    reason: "Temporary issues can sometimes be resolved by refreshing"
  },
  {
    action: "Report this issue if it persists",
    docLink: "/support"
  }
];

/**
 * Extract error message from various error types
 */
function extractErrorMessage(error: Error | string | Record<string, unknown>): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    // Try common error message fields
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
    if ('error' in error && typeof error.error === 'string') {
      return error.error;
    }
    if ('detail' in error && typeof error.detail === 'string') {
      return error.detail;
    }
    // Return JSON string as fallback
    return JSON.stringify(error);
  }

  return String(error);
}

/**
 * Categorize an error based on its message and type
 *
 * @param error - The error to categorize
 * @returns A categorized error with severity, category, and suggestions
 */
export function categorizeError(error: Error | string | Record<string, unknown>): CategorizedError {
  const errorMessage = extractErrorMessage(error);

  // Try to match against known patterns
  for (const pattern of ERROR_PATTERNS) {
    const regex = pattern.pattern instanceof RegExp
      ? pattern.pattern
      : new RegExp(pattern.pattern, 'i');

    if (regex.test(errorMessage)) {
      return {
        error,
        severity: pattern.severity,
        category: pattern.category,
        title: pattern.title,
        suggestions: pattern.suggestions
      };
    }
  }

  // Return generic categorization if no patterns match
  return {
    error,
    severity: ErrorSeverity.INFO,
    category: ErrorCategory.GENERIC,
    title: "Error",
    suggestions: GENERIC_SUGGESTIONS
  };
}

/**
 * Get the color associated with a severity level
 *
 * @param severity - The severity level
 * @returns A CSS color string (should be used with MUI theme)
 */
export function getSeverityColor(severity: ErrorSeverity): string {
  switch (severity) {
    case ErrorSeverity.INFO:
      return "info.main";
    case ErrorSeverity.WARNING:
      return "warning.main";
    case ErrorSeverity.ERROR:
      return "error.main";
    case ErrorSeverity.CRITICAL:
      return "error.dark";
    default:
      return "text.primary";
  }
}

/**
 * Check if a severity level is high priority (error or critical)
 *
 * @param severity - The severity level to check
 * @returns True if severity is error or critical
 */
export function isHighPrioritySeverity(severity: ErrorSeverity): boolean {
  return severity === ErrorSeverity.ERROR || severity === ErrorSeverity.CRITICAL;
}
