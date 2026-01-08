/**
 * Metrics Storage
 * Handles persistent storage and retrieval of metrics data
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type {
  ToolCallMetric,
  EmbeddingMetric,
  SearchMetric,
  NodeActivityMetric,
  DailyMetrics,
  MetricsSnapshot,
  MetricsConfig,
  TimeSeriesData,
} from "../types/metrics.js";

export class MetricsStorage {
  private baseDir: string;
  private config: MetricsConfig;

  constructor(baseDir: string, config?: Partial<MetricsConfig>) {
    this.baseDir = join(baseDir, "metrics");
    this.config = {
      enabled: config?.enabled ?? true,
      retentionDays: config?.retentionDays ?? 30,
      aggregationIntervals: config?.aggregationIntervals ?? ['1h', '24h', '7d', '30d'],
      trackToolCalls: config?.trackToolCalls ?? true,
      trackSearches: config?.trackSearches ?? true,
      trackNodeActivity: config?.trackNodeActivity ?? true,
      trackPerformance: config?.trackPerformance ?? true,
    };

    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }

    // Create subdirectories
    for (const dir of ['tool-calls', 'embeddings', 'searches', 'node-activity', 'daily', 'snapshots']) {
      const path = join(this.baseDir, dir);
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    }
  }

  /**
   * Record a tool call metric
   */
  recordToolCall(metric: ToolCallMetric): void {
    if (!this.config.enabled || !this.config.trackToolCalls) return;

    const date = new Date(metric.timestamp).toISOString().split('T')[0];
    const file = join(this.baseDir, 'tool-calls', `${date}.jsonl`);

    const line = JSON.stringify(metric) + '\n';
    writeFileSync(file, line, { flag: 'a' });
  }

  /**
   * Record an embedding operation metric
   */
  recordEmbedding(metric: EmbeddingMetric): void {
    if (!this.config.enabled || !this.config.trackPerformance) return;

    const date = new Date(metric.timestamp).toISOString().split('T')[0];
    const file = join(this.baseDir, 'embeddings', `${date}.jsonl`);

    const line = JSON.stringify(metric) + '\n';
    writeFileSync(file, line, { flag: 'a' });
  }

  /**
   * Record a search metric
   */
  recordSearch(metric: SearchMetric): void {
    if (!this.config.enabled || !this.config.trackSearches) return;

    const date = new Date(metric.timestamp).toISOString().split('T')[0];
    const file = join(this.baseDir, 'searches', `${date}.jsonl`);

    const line = JSON.stringify(metric) + '\n';
    writeFileSync(file, line, { flag: 'a' });
  }

  /**
   * Record a node activity metric
   */
  recordNodeActivity(metric: NodeActivityMetric): void {
    if (!this.config.enabled || !this.config.trackNodeActivity) return;

    const date = new Date(metric.timestamp).toISOString().split('T')[0];
    const file = join(this.baseDir, 'node-activity', `${date}.jsonl`);

    const line = JSON.stringify(metric) + '\n';
    writeFileSync(file, line, { flag: 'a' });
  }

  /**
   * Read metrics from a JSONL file
   */
  private readJSONL<T>(file: string): T[] {
    if (!existsSync(file)) return [];

    const content = readFileSync(file, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as T);
  }

  /**
   * Get tool call metrics for a date range
   */
  getToolCalls(startDate: string, endDate: string): ToolCallMetric[] {
    const metrics: ToolCallMetric[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = d.toISOString().split('T')[0];
      const file = join(this.baseDir, 'tool-calls', `${date}.jsonl`);
      metrics.push(...this.readJSONL<ToolCallMetric>(file));
    }

    return metrics;
  }

  /**
   * Get search metrics for a date range
   */
  getSearches(startDate: string, endDate: string): SearchMetric[] {
    const metrics: SearchMetric[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = d.toISOString().split('T')[0];
      const file = join(this.baseDir, 'searches', `${date}.jsonl`);
      metrics.push(...this.readJSONL<SearchMetric>(file));
    }

    return metrics;
  }

  /**
   * Get node activity metrics for a date range
   */
  getNodeActivity(startDate: string, endDate: string): NodeActivityMetric[] {
    const metrics: NodeActivityMetric[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = d.toISOString().split('T')[0];
      const file = join(this.baseDir, 'node-activity', `${date}.jsonl`);
      metrics.push(...this.readJSONL<NodeActivityMetric>(file));
    }

    return metrics;
  }

  /**
   * Get embedding metrics for a date range
   */
  getEmbeddings(startDate: string, endDate: string): EmbeddingMetric[] {
    const metrics: EmbeddingMetric[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = d.toISOString().split('T')[0];
      const file = join(this.baseDir, 'embeddings', `${date}.jsonl`);
      metrics.push(...this.readJSONL<EmbeddingMetric>(file));
    }

    return metrics;
  }

  /**
   * Generate daily aggregated metrics
   */
  aggregateDaily(date: string): DailyMetrics {
    const toolCalls = this.getToolCalls(date, date);
    const searches = this.getSearches(date, date);
    const nodeActivity = this.getNodeActivity(date, date);

    const toolCallsByTool = new Map<string, number>();
    let totalToolDuration = 0;

    for (const call of toolCalls) {
      toolCallsByTool.set(call.toolName, (toolCallsByTool.get(call.toolName) || 0) + 1);
      totalToolDuration += call.duration;
    }

    const searchesByQuery = new Map<string, number>();
    let totalSearchDuration = 0;

    for (const search of searches) {
      if (search.query) {
        searchesByQuery.set(search.query, (searchesByQuery.get(search.query) || 0) + 1);
      }
      totalSearchDuration += search.duration;
    }

    const created = nodeActivity.filter(a => a.operation === 'create').length;
    const updated = nodeActivity.filter(a => a.operation === 'update').length;

    const topTools = Array.from(toolCallsByTool.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tool, count]) => ({ tool, count }));

    const topSearchQueries = Array.from(searchesByQuery.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    return {
      date,
      toolCalls: toolCalls.length,
      searches: searches.length,
      nodesCreated: created,
      nodesUpdated: updated,
      avgToolCallDuration: toolCalls.length > 0 ? totalToolDuration / toolCalls.length : 0,
      avgSearchDuration: searches.length > 0 ? totalSearchDuration / searches.length : 0,
      topTools,
      topSearchQueries,
    };
  }

  /**
   * Save daily aggregation
   */
  saveDailyMetrics(metrics: DailyMetrics): void {
    const file = join(this.baseDir, 'daily', `${metrics.date}.json`);
    writeFileSync(file, JSON.stringify(metrics, null, 2));
  }

  /**
   * Generate and save snapshot
   */
  generateSnapshot(period: '1h' | '24h' | '7d' | '30d' | 'all', totalActiveNodes: number): MetricsSnapshot {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date(0);
        break;
    }

    const start = startDate.toISOString().split('T')[0];
    const end = now.toISOString().split('T')[0];

    const toolCalls = this.getToolCalls(start, end);
    const searches = this.getSearches(start, end);
    const nodeActivity = this.getNodeActivity(start, end);
    const embeddings = this.getEmbeddings(start, end);

    // Aggregate tool calls
    const toolCallsByTool: Record<string, number> = {};
    let totalToolDuration = 0;
    let successfulCalls = 0;

    for (const call of toolCalls) {
      toolCallsByTool[call.toolName] = (toolCallsByTool[call.toolName] || 0) + 1;
      totalToolDuration += call.duration;
      if (call.success) successfulCalls++;
    }

    // Aggregate searches
    const searchesByType: Record<string, number> = {};
    let totalSearchDuration = 0;
    let totalResultCount = 0;

    for (const search of searches) {
      searchesByType[search.type] = (searchesByType[search.type] || 0) + 1;
      totalSearchDuration += search.duration;
      totalResultCount += search.resultCount;
    }

    // Aggregate node activity
    const created = nodeActivity.filter(a => a.operation === 'create').length;
    const updated = nodeActivity.filter(a => a.operation === 'update').length;
    const deleted = nodeActivity.filter(a => a.operation === 'delete').length;

    // Performance metrics
    const totalEmbeddingTime = embeddings.reduce((sum, e) => sum + e.duration, 0);

    const snapshot: MetricsSnapshot = {
      timestamp: now.toISOString(),
      period,
      toolCalls: {
        total: toolCalls.length,
        byTool: toolCallsByTool,
        avgDuration: toolCalls.length > 0 ? totalToolDuration / toolCalls.length : 0,
        successRate: toolCalls.length > 0 ? successfulCalls / toolCalls.length : 1,
      },
      searches: {
        total: searches.length,
        byType: searchesByType,
        avgDuration: searches.length > 0 ? totalSearchDuration / searches.length : 0,
        avgResultCount: searches.length > 0 ? totalResultCount / searches.length : 0,
      },
      nodes: {
        created,
        updated,
        deleted,
        totalActive: totalActiveNodes,
      },
      performance: {
        avgEmbeddingTime: embeddings.length > 0 ? totalEmbeddingTime / embeddings.length : 0,
        avgSearchTime: searches.length > 0 ? totalSearchDuration / searches.length : 0,
        avgToolCallTime: toolCalls.length > 0 ? totalToolDuration / toolCalls.length : 0,
      },
    };

    // Save snapshot
    const file = join(this.baseDir, 'snapshots', `${period}-${now.toISOString().split('T')[0]}.json`);
    writeFileSync(file, JSON.stringify(snapshot, null, 2));

    return snapshot;
  }

  /**
   * Clean up old metrics based on retention policy
   */
  cleanup(): { removed: number } {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    let removed = 0;

    for (const dir of ['tool-calls', 'embeddings', 'searches', 'node-activity']) {
      const path = join(this.baseDir, dir);
      if (!existsSync(path)) continue;

      const files = readdirSync(path);
      for (const file of files) {
        const date = file.replace('.jsonl', '');
        if (date < cutoff) {
          unlinkSync(join(path, file));
          removed++;
        }
      }
    }

    return { removed };
  }

  /**
   * Get time series data for a metric type
   */
  getTimeSeries(
    type: 'tool-calls' | 'searches' | 'node-activity',
    startDate: string,
    endDate: string,
    interval: 'hour' | 'day' = 'hour'
  ): TimeSeriesData[] {
    let data: Array<{ timestamp: string; duration?: number }> = [];

    switch (type) {
      case 'tool-calls':
        data = this.getToolCalls(startDate, endDate);
        break;
      case 'searches':
        data = this.getSearches(startDate, endDate);
        break;
      case 'node-activity':
        data = this.getNodeActivity(startDate, endDate);
        break;
    }

    const grouped = new Map<string, { count: number; totalDuration: number }>();

    for (const item of data) {
      let key: string;
      if (interval === 'hour') {
        key = new Date(item.timestamp).toISOString().substring(0, 13) + ':00:00.000Z';
      } else {
        key = new Date(item.timestamp).toISOString().split('T')[0];
      }

      if (!grouped.has(key)) {
        grouped.set(key, { count: 0, totalDuration: 0 });
      }

      const entry = grouped.get(key)!;
      entry.count++;
      if ('duration' in item && typeof item.duration === 'number') {
        entry.totalDuration += item.duration;
      }
    }

    return Array.from(grouped.entries())
      .map(([hour, { count, totalDuration }]) => ({
        hour,
        count,
        avgDuration: count > 0 ? totalDuration / count : undefined,
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
  }
}
