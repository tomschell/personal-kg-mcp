/**
 * Metrics Type Definitions
 * Defines types for comprehensive metrics tracking
 */

export interface ToolCallMetric {
  timestamp: string;
  toolName: string;
  duration: number; // milliseconds
  success: boolean;
  error?: string;
  args?: Record<string, unknown>;
}

export interface EmbeddingMetric {
  timestamp: string;
  operation: 'embed' | 'similarity';
  duration: number; // milliseconds
  dimensions: number;
  textLength?: number;
}

export interface SearchMetric {
  timestamp: string;
  type: 'search' | 'semantic_search' | 'find_similar' | 'time_range' | 'context';
  query?: string;
  tags?: string[];
  resultCount: number;
  duration: number; // milliseconds
  topScore?: number;
}

export interface NodeActivityMetric {
  timestamp: string;
  operation: 'create' | 'update' | 'delete' | 'read';
  nodeType: string;
  nodeId?: string;
}

export interface TimeSeriesData {
  hour: string; // ISO timestamp rounded to hour
  count: number;
  avgDuration?: number;
}

export interface DailyMetrics {
  date: string; // YYYY-MM-DD
  toolCalls: number;
  searches: number;
  nodesCreated: number;
  nodesUpdated: number;
  avgToolCallDuration: number;
  avgSearchDuration: number;
  topTools: Array<{ tool: string; count: number }>;
  topSearchQueries: Array<{ query: string; count: number }>;
}

export interface MetricsSnapshot {
  timestamp: string;
  period: '1h' | '24h' | '7d' | '30d' | 'all';
  toolCalls: {
    total: number;
    byTool: Record<string, number>;
    avgDuration: number;
    successRate: number;
  };
  searches: {
    total: number;
    byType: Record<string, number>;
    avgDuration: number;
    avgResultCount: number;
  };
  nodes: {
    created: number;
    updated: number;
    deleted: number;
    totalActive: number;
  };
  performance: {
    avgEmbeddingTime: number;
    avgSearchTime: number;
    avgToolCallTime: number;
  };
}

export interface MetricsConfig {
  enabled: boolean;
  retentionDays: number; // How long to keep raw metrics
  aggregationIntervals: Array<'1h' | '24h' | '7d' | '30d'>;
  trackToolCalls: boolean;
  trackSearches: boolean;
  trackNodeActivity: boolean;
  trackPerformance: boolean;
}
