/**
 * Metrics Tools
 * Consolidated MCP tool for querying and analyzing metrics data
 */
import { z } from "zod";
// Metrics operation types
const MetricsOperation = ["snapshot", "daily", "timeseries", "tool_calls", "searches", "cleanup"];
const TimePeriod = ["1h", "24h", "7d", "30d", "all"];
const TimeSeriesType = ["tool-calls", "searches", "node-activity"];
const TimeInterval = ["hour", "day"];
export function setupMetricsTools(server, metricsStorage, storage) {
    if (!metricsStorage) {
        // Metrics disabled, don't register tools
        return;
    }
    // =============================================================================
    // CONSOLIDATED METRICS TOOL
    // Replaces: kg_metrics_snapshot, kg_metrics_daily, kg_metrics_timeseries,
    //           kg_metrics_tool_calls, kg_metrics_searches, kg_metrics_cleanup
    // =============================================================================
    server.tool("kg_metrics", "Unified metrics tool. Supports: 'snapshot' for period overview, 'daily' for specific date, 'timeseries' for trends, 'tool_calls' for tool usage, 'searches' for search patterns, 'cleanup' for maintenance.", {
        operation: z.enum(MetricsOperation)
            .describe("Metrics operation: 'snapshot', 'daily', 'timeseries', 'tool_calls', 'searches', 'cleanup'."),
        // snapshot options
        period: z.enum(TimePeriod).default("24h").optional()
            .describe("[snapshot] Time period: 1h, 24h, 7d, 30d, all."),
        // daily options
        date: z.string().optional()
            .describe("[daily] Date in YYYY-MM-DD format."),
        // timeseries options
        seriesType: z.enum(TimeSeriesType).optional()
            .describe("[timeseries] Type: tool-calls, searches, node-activity."),
        interval: z.enum(TimeInterval).default("hour").optional()
            .describe("[timeseries] Interval: hour, day."),
        // tool_calls options
        toolName: z.string().optional()
            .describe("[tool_calls] Filter by specific tool name."),
        // shared date range options (timeseries, tool_calls, searches)
        startDate: z.string().optional()
            .describe("[timeseries, tool_calls, searches] Start date YYYY-MM-DD."),
        endDate: z.string().optional()
            .describe("[timeseries, tool_calls, searches] End date YYYY-MM-DD."),
    }, async (args) => {
        const { operation, period = "24h", date, seriesType, interval = "hour", toolName, startDate, endDate } = args;
        switch (operation) {
            case "snapshot":
                return handleSnapshot(metricsStorage, storage, period);
            case "daily":
                return handleDaily(metricsStorage, date);
            case "timeseries":
                return handleTimeseries(metricsStorage, seriesType, startDate, endDate, interval);
            case "tool_calls":
                return handleToolCalls(metricsStorage, startDate, endDate, toolName);
            case "searches":
                return handleSearches(metricsStorage, startDate, endDate);
            case "cleanup":
                return handleCleanup(metricsStorage);
            default:
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ error: `Unknown operation: ${operation}` }, null, 2),
                        },
                    ],
                };
        }
    });
}
// =============================================================================
// METRICS OPERATION HANDLERS
// =============================================================================
async function handleSnapshot(metricsStorage, storage, period) {
    const totalNodes = storage.listAllNodes().length;
    const snapshot = metricsStorage.generateSnapshot(period, totalNodes);
    return {
        content: [{ type: "text", text: JSON.stringify({ operation: "snapshot", ...snapshot }, null, 2) }],
        structuredContent: { operation: "snapshot", ...snapshot },
    };
}
async function handleDaily(metricsStorage, date) {
    if (!date) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ error: "date is required for daily operation (YYYY-MM-DD)" }, null, 2),
                },
            ],
        };
    }
    const metrics = metricsStorage.aggregateDaily(date);
    return {
        content: [{ type: "text", text: JSON.stringify({ operation: "daily", forDate: date, ...metrics }, null, 2) }],
        structuredContent: { operation: "daily", forDate: date, ...metrics },
    };
}
async function handleTimeseries(metricsStorage, seriesType, startDate, endDate, interval = "hour") {
    if (!seriesType || !startDate || !endDate) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        error: "seriesType, startDate, and endDate are required for timeseries operation"
                    }, null, 2),
                },
            ],
        };
    }
    const timeseries = metricsStorage.getTimeSeries(seriesType, startDate, endDate, interval);
    return {
        content: [{ type: "text", text: JSON.stringify({ operation: "timeseries", seriesType, startDate, endDate, interval, data: timeseries }, null, 2) }],
        structuredContent: { operation: "timeseries", seriesType, startDate, endDate, interval, data: timeseries },
    };
}
async function handleToolCalls(metricsStorage, startDate, endDate, toolName) {
    if (!startDate || !endDate) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ error: "startDate and endDate are required for tool_calls operation" }, null, 2),
                },
            ],
        };
    }
    let calls = metricsStorage.getToolCalls(startDate, endDate);
    if (toolName) {
        calls = calls.filter(c => c.toolName === toolName);
    }
    // Aggregate statistics
    const byTool = new Map();
    for (const call of calls) {
        if (!byTool.has(call.toolName)) {
            byTool.set(call.toolName, { count: 0, totalDuration: 0, errors: 0 });
        }
        const stats = byTool.get(call.toolName);
        stats.count++;
        stats.totalDuration += call.duration;
        if (!call.success)
            stats.errors++;
    }
    const summary = Array.from(byTool.entries()).map(([tool, stats]) => ({
        tool,
        count: stats.count,
        avgDuration: stats.totalDuration / stats.count,
        errorRate: stats.errors / stats.count,
    })).sort((a, b) => b.count - a.count);
    return {
        content: [{ type: "text", text: JSON.stringify({ operation: "tool_calls", total: calls.length, summary }, null, 2) }],
        structuredContent: { operation: "tool_calls", total: calls.length, summary },
    };
}
async function handleSearches(metricsStorage, startDate, endDate) {
    if (!startDate || !endDate) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ error: "startDate and endDate are required for searches operation" }, null, 2),
                },
            ],
        };
    }
    const searches = metricsStorage.getSearches(startDate, endDate);
    // Aggregate by type
    const byType = new Map();
    for (const search of searches) {
        if (!byType.has(search.type)) {
            byType.set(search.type, { count: 0, totalDuration: 0, totalResults: 0 });
        }
        const stats = byType.get(search.type);
        stats.count++;
        stats.totalDuration += search.duration;
        stats.totalResults += search.resultCount;
    }
    // Top queries
    const queryCount = new Map();
    for (const search of searches) {
        if (search.query) {
            queryCount.set(search.query, (queryCount.get(search.query) || 0) + 1);
        }
    }
    const topQueries = Array.from(queryCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([query, count]) => ({ query, count }));
    const summary = Array.from(byType.entries()).map(([type, stats]) => ({
        type,
        count: stats.count,
        avgDuration: stats.totalDuration / stats.count,
        avgResults: stats.totalResults / stats.count,
    }));
    return {
        content: [{ type: "text", text: JSON.stringify({ operation: "searches", total: searches.length, summary, topQueries }, null, 2) }],
        structuredContent: { operation: "searches", total: searches.length, summary, topQueries },
    };
}
async function handleCleanup(metricsStorage) {
    const result = metricsStorage.cleanup();
    return {
        content: [{ type: "text", text: JSON.stringify({ operation: "cleanup", ...result }, null, 2) }],
        structuredContent: { operation: "cleanup", ...result },
    };
}
