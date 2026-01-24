// Diagnostic Dashboard Tool
// Generates a self-contained HTML file for debugging knowledge graph context selection
import { z } from "zod";
import { isOpenAIAvailable } from "../utils/embeddings.js";
import { selectSmartContext } from "../utils/sessionContext.js";
import * as fs from "node:fs";
import * as path from "node:path";
function logToolCall(name, args) {
    try {
        const now = new Date().toISOString();
        if (args && typeof args === "object") {
            const keys = Object.keys(args);
            const preview = {};
            for (const k of keys) {
                const v = args[k];
                if (typeof v === "string" && v.length <= 120) {
                    preview[k] = v;
                }
                else if (typeof v === "number" || typeof v === "boolean" || v == null) {
                    preview[k] = v;
                }
                else if (Array.isArray(v)) {
                    preview[k] = `array(len=${v.length})`;
                }
                else if (typeof v === "object") {
                    preview[k] = "object";
                }
            }
            console.error(`[PKG] ${now} tool=${name} args=${JSON.stringify(preview)}`);
        }
        else {
            console.error(`[PKG] ${now} tool=${name}`);
        }
    }
    catch {
        // ignore logging failures
    }
}
function getImportanceWeight(node) {
    let weight = 1.0;
    if (node.importance === "high")
        weight = 3.0;
    else if (node.importance === "medium")
        weight = 1.5;
    else if (node.importance === "low")
        weight = 0.5;
    if (node.type === "decision")
        weight *= 2.0;
    else if (node.type === "question")
        weight *= 1.8;
    else if (node.type === "insight")
        weight *= 1.5;
    if (node.tags.includes("blocker"))
        weight *= 2.5;
    if (node.tags.some(t => t.includes("lint") || t.includes("format") || t.includes("fix"))) {
        weight *= 0.6;
    }
    return weight;
}
function getTemporalWeight(node, now) {
    const nodeDate = new Date(node.updatedAt);
    const hoursSince = (now.getTime() - nodeDate.getTime()) / (1000 * 60 * 60);
    return Math.exp(-hoursSince / 24);
}
function getContextReason(node, isIncluded, importanceWeight, temporalWeight) {
    if (!isIncluded) {
        if (temporalWeight < 0.1)
            return "Temporal decay (old node)";
        if (importanceWeight < 1.0)
            return "Low importance weight";
        return "Below diversity threshold";
    }
    const reasons = [];
    if (node.type === "decision")
        reasons.push("Decision type (2x boost)");
    if (node.type === "question")
        reasons.push("Question type (1.8x boost)");
    if (node.type === "insight")
        reasons.push("Insight type (1.5x boost)");
    if (node.importance === "high")
        reasons.push("High importance (3x)");
    if (node.tags.includes("blocker"))
        reasons.push("Blocker tag (2.5x)");
    if (temporalWeight > 0.5)
        reasons.push("Recent (temporal boost)");
    return reasons.length > 0 ? reasons.join(", ") : "Diversity selection";
}
export function generateDiagnosticData(storage, project) {
    const now = new Date();
    let allNodes = storage.listAllNodes();
    const allEdges = storage.listEdges();
    // Filter by project if specified
    if (project) {
        const projectTag = `proj:${project.toLowerCase().replace(/\s+/g, "-")}`;
        allNodes = allNodes.filter(n => n.tags.includes(projectTag));
    }
    // Simulate context selection
    const contextResult = selectSmartContext(allNodes, 20);
    const includedIds = new Set(contextResult.priorityNodes.map(n => n.id));
    // Score all nodes
    const nodesWithScores = allNodes.map(node => {
        const importanceWeight = getImportanceWeight(node);
        const temporalWeight = getTemporalWeight(node, now);
        const isIncluded = includedIds.has(node.id);
        return {
            ...node,
            importanceWeight,
            temporalWeight,
            totalScore: importanceWeight * temporalWeight,
            contextIncluded: isIncluded,
            contextReason: getContextReason(node, isIncluded, importanceWeight, temporalWeight)
        };
    });
    // Sort by total score descending
    nodesWithScores.sort((a, b) => b.totalScore - a.totalScore);
    const nodesWithEmbeddings = allNodes.filter(n => n.embedding && n.embedding.length > 0);
    const embeddingType = isOpenAIAvailable() && nodesWithEmbeddings.length > 0 ? "openai" : "local";
    return {
        metadata: {
            generatedAt: now.toISOString(),
            totalNodes: allNodes.length,
            totalEdges: allEdges.length,
            embeddingType,
            project
        },
        nodes: nodesWithScores,
        edges: allEdges,
        contextSimulation: {
            includedIds: Array.from(includedIds),
            excludedIds: allNodes.filter(n => !includedIds.has(n.id)).map(n => n.id),
            summary: contextResult.summary
        }
    };
}
export function generateHtmlDashboard(data) {
    // Escape data for embedding in HTML
    const jsonData = JSON.stringify(data)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PKG Diagnostic Dashboard</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --border: #30363d;
      --text-primary: #e6edf3;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-yellow: #d29922;
      --accent-red: #f85149;
      --accent-purple: #a371f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      font-size: 14px;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

    /* Header */
    .header { margin-bottom: 24px; }
    h1 {
      color: var(--text-primary);
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .meta {
      color: var(--text-secondary);
      font-size: 13px;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .meta-item { display: flex; align-items: center; gap: 4px; }
    .meta-value { color: var(--text-primary); font-weight: 500; }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 0;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
      border-radius: 8px 8px 0 0;
      overflow: hidden;
    }
    .tab {
      padding: 12px 20px;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.15s;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .tab:hover { color: var(--text-primary); background: var(--bg-tertiary); }
    .tab.active {
      color: var(--accent-blue);
      border-bottom-color: var(--accent-blue);
      background: var(--bg-primary);
    }

    /* Panels */
    .panel { display: none; }
    .panel.active { display: block; }

    /* Controls Bar */
    .controls {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
      align-items: center;
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .control-group { display: flex; align-items: center; gap: 8px; }
    .control-group label {
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    select, input[type="text"] {
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      color: var(--text-primary);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      min-width: 140px;
    }
    select:focus, input:focus {
      border-color: var(--accent-blue);
      outline: none;
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
    }

    /* Toggle Switch */
    .toggle-group { display: flex; align-items: center; gap: 8px; }
    .toggle {
      position: relative;
      width: 44px;
      height: 24px;
      background: var(--bg-tertiary);
      border-radius: 12px;
      cursor: pointer;
      border: 1px solid var(--border);
      transition: all 0.2s;
    }
    .toggle.active { background: var(--accent-blue); border-color: var(--accent-blue); }
    .toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .toggle.active::after { transform: translateX(20px); }

    /* Node List */
    .node-list { display: flex; flex-direction: column; gap: 12px; }

    /* Node Card - Improved */
    .node-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 20px;
      transition: border-color 0.15s;
    }
    .node-card:hover { border-color: var(--text-muted); }
    .node-card.included { border-left: 4px solid var(--accent-green); }
    .node-card.excluded { border-left: 4px solid var(--accent-red); }

    .node-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      gap: 16px;
    }
    .node-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

    .node-type {
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 20px;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .node-type.decision { background: rgba(88, 166, 255, 0.15); color: var(--accent-blue); }
    .node-type.insight { background: rgba(163, 113, 247, 0.15); color: var(--accent-purple); }
    .node-type.question { background: rgba(210, 153, 34, 0.15); color: var(--accent-yellow); }
    .node-type.progress { background: rgba(63, 185, 80, 0.15); color: var(--accent-green); }
    .node-type.idea { background: rgba(139, 148, 158, 0.15); color: var(--text-secondary); }
    .node-type.session { background: rgba(248, 81, 73, 0.15); color: var(--accent-red); }

    .node-date {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Score Display - Improved */
    .score-panel {
      display: flex;
      gap: 16px;
      align-items: center;
      padding: 8px 12px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      font-size: 12px;
    }
    .score-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 50px;
    }
    .score-value {
      font-size: 18px;
      font-weight: 700;
      line-height: 1;
    }
    .score-value.importance { color: var(--accent-blue); }
    .score-value.temporal { color: var(--accent-yellow); }
    .score-value.total { color: var(--accent-green); }
    .score-label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-top: 4px;
    }
    .score-divider {
      color: var(--text-muted);
      font-size: 16px;
    }

    .node-content {
      color: var(--text-primary);
      font-size: 14px;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .node-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .tag {
      font-size: 11px;
      padding: 3px 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      color: var(--text-secondary);
      font-weight: 500;
    }
    .tag.proj { background: rgba(88, 166, 255, 0.1); color: var(--accent-blue); }
    .tag.ws { background: rgba(163, 113, 247, 0.1); color: var(--accent-purple); }

    .node-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      margin-top: 4px;
    }
    .node-id { font-size: 11px; color: var(--text-muted); font-family: monospace; }
    .context-reason {
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .context-reason.included { color: var(--accent-green); }
    .context-reason.excluded { color: var(--accent-red); }

    /* Search Debugger */
    .search-box {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
    }
    .search-box input {
      flex: 1;
      padding: 12px 16px;
      font-size: 14px;
    }
    .search-box button {
      background: var(--accent-green);
      border: none;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: opacity 0.15s;
    }
    .search-box button:hover { opacity: 0.9; }

    .search-results { margin-top: 20px; }
    .result-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 10px;
      display: flex;
      align-items: flex-start;
      gap: 20px;
    }
    .similarity-score {
      font-size: 28px;
      font-weight: 700;
      min-width: 70px;
      text-align: center;
      padding: 8px;
      border-radius: 8px;
      background: var(--bg-tertiary);
    }
    .similarity-score.high { color: var(--accent-green); }
    .similarity-score.medium { color: var(--accent-yellow); }
    .similarity-score.low { color: var(--accent-red); }
    .result-content { flex: 1; }
    .match-status {
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .match-status.matched { background: rgba(63, 185, 80, 0.15); color: var(--accent-green); }
    .match-status.below { background: rgba(248, 81, 73, 0.15); color: var(--accent-red); }

    .threshold-info {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .threshold-slider {
      width: 200px;
      accent-color: var(--accent-blue);
    }

    /* Context Debugger - Stats Cards */
    .context-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (max-width: 800px) {
      .context-stats { grid-template-columns: repeat(2, 1fr); }
    }
    .stat-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      text-align: center;
    }
    .stat-value {
      font-size: 36px;
      font-weight: 700;
      color: var(--accent-blue);
      line-height: 1;
    }
    .stat-label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .context-section { margin-bottom: 32px; }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-count {
      background: var(--bg-tertiary);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 48px;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border-radius: 10px;
      border: 1px dashed var(--border);
    }

    /* Utility */
    .text-muted { color: var(--text-secondary); }
    .text-small { font-size: 12px; }

    /* Results summary */
    .results-summary {
      padding: 12px 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      color: var(--text-secondary);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>PKG Diagnostic Dashboard</h1>
      <div class="meta">
        <span class="meta-item">Generated <span class="meta-value" id="generated-at"></span></span>
        <span class="meta-item">Nodes <span class="meta-value" id="total-nodes"></span></span>
        <span class="meta-item">Edges <span class="meta-value" id="total-edges"></span></span>
        <span class="meta-item">Embeddings <span class="meta-value" id="embedding-type"></span></span>
        <span id="project-filter"></span>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" data-panel="browser">Node Browser</button>
      <button class="tab" data-panel="search">Search Debugger</button>
      <button class="tab" data-panel="context">Context Debugger</button>
    </div>

    <!-- Node Browser Panel -->
    <div id="browser" class="panel active">
      <div class="controls">
        <div class="control-group">
          <label>Type</label>
          <select id="filter-type">
            <option value="">All Types</option>
            <option value="decision">Decision</option>
            <option value="insight">Insight</option>
            <option value="question">Question</option>
            <option value="progress">Progress</option>
            <option value="idea">Idea</option>
            <option value="session">Session</option>
          </select>
        </div>
        <div class="control-group">
          <label>Context</label>
          <select id="filter-context">
            <option value="">All</option>
            <option value="included">Included</option>
            <option value="excluded">Excluded</option>
          </select>
        </div>
        <div class="control-group">
          <label>Search</label>
          <input type="text" id="filter-text" placeholder="Filter content...">
        </div>
        <div class="control-group">
          <label>Sort</label>
          <select id="sort-by">
            <option value="importance">Importance</option>
            <option value="score">Combined Score</option>
            <option value="recent">Most Recent</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
        <div class="toggle-group">
          <label>Ignore Time Decay</label>
          <div class="toggle" id="ignore-temporal" title="Sort by importance only, ignore temporal decay"></div>
        </div>
      </div>
      <div id="node-list" class="node-list"></div>
    </div>

    <!-- Search Debugger Panel -->
    <div id="search" class="panel">
      <div class="search-box">
        <input type="text" id="search-query" placeholder="Enter search query to test similarity scores...">
        <button onclick="runSearchDebug()">Search</button>
      </div>
      <div class="threshold-info">
        <label>Similarity Threshold: <strong id="threshold-value">0.15</strong></label>
        <input type="range" id="threshold-slider" class="threshold-slider" min="0" max="1" step="0.05" value="0.15">
        <span class="text-muted text-small">Nodes below this threshold are excluded from search results</span>
      </div>
      <div id="search-results" class="search-results">
        <div class="empty-state">Enter a query above to see how nodes rank by similarity</div>
      </div>
    </div>

    <!-- Context Debugger Panel -->
    <div id="context" class="panel">
      <div class="context-stats">
        <div class="stat-card">
          <div class="stat-value" id="ctx-included" style="color: var(--accent-green)">0</div>
          <div class="stat-label">Included</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="ctx-excluded" style="color: var(--accent-red)">0</div>
          <div class="stat-label">Excluded</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="ctx-workstreams">0</div>
          <div class="stat-label">Workstreams</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="ctx-highvol">0</div>
          <div class="stat-label">High-Volume</div>
        </div>
      </div>

      <div class="context-section">
        <div class="section-header">
          <span class="section-title"><span style="color: var(--accent-green)">✓</span> Included in Context</span>
          <span class="section-count" id="included-count">0</span>
        </div>
        <div id="included-list" class="node-list"></div>
      </div>

      <div class="context-section">
        <div class="section-header">
          <span class="section-title"><span style="color: var(--accent-red)">✗</span> Excluded from Context</span>
          <span class="section-count" id="excluded-count">0</span>
        </div>
        <div id="excluded-list" class="node-list"></div>
      </div>
    </div>
  </div>

  <script>
    const DATA = ${jsonData};
    let ignoreTemporalDecay = false;

    // Initialize
    document.getElementById('generated-at').textContent = new Date(DATA.metadata.generatedAt).toLocaleString();
    document.getElementById('total-nodes').textContent = DATA.metadata.totalNodes;
    document.getElementById('total-edges').textContent = DATA.metadata.totalEdges;
    document.getElementById('embedding-type').textContent = DATA.metadata.embeddingType;
    if (DATA.metadata.project) {
      document.getElementById('project-filter').innerHTML =
        '<span class="meta-item">Project <span class="meta-value">' + DATA.metadata.project + '</span></span>';
    }

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.panel).classList.add('active');
      });
    });

    // Toggle for ignoring temporal decay
    document.getElementById('ignore-temporal').addEventListener('click', function() {
      this.classList.toggle('active');
      ignoreTemporalDecay = this.classList.contains('active');
      renderNodeBrowser();
    });

    // Format relative time - show actual date for older items
    function formatRelativeTime(dateStr) {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return diffDays + ' days ago';
      if (diffDays < 30) return Math.floor(diffDays / 7) + ' weeks ago';
      // For older items, show the actual date for clarity
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Node card template - improved
    function renderNodeCard(node, showContext = true) {
      const contextClass = node.contextIncluded ? 'included' : 'excluded';
      const reasonClass = node.contextIncluded ? 'included' : 'excluded';

      const tagsHtml = node.tags.slice(0, 6).map(t => {
        let tagClass = 'tag';
        if (t.startsWith('proj:')) tagClass += ' proj';
        else if (t.startsWith('ws:')) tagClass += ' ws';
        return '<span class="' + tagClass + '">' + escapeHtml(t) + '</span>';
      }).join('') + (node.tags.length > 6 ? '<span class="tag">+' + (node.tags.length - 6) + '</span>' : '');

      const contextHtml = showContext ?
        '<div class="context-reason ' + reasonClass + '">' +
        (node.contextIncluded ? '✓ ' : '✗ ') + escapeHtml(node.contextReason || '') +
        '</div>' : '';

      const effectiveScore = ignoreTemporalDecay ? node.importanceWeight : node.totalScore;
      const safeFixed = (val, digits) => (val != null && !isNaN(val)) ? val.toFixed(digits) : '?';

      return '<div class="node-card ' + contextClass + '">' +
        '<div class="node-header">' +
          '<div class="node-meta">' +
            '<span class="node-type ' + node.type + '">' + node.type + '</span>' +
            '<span class="node-date">' + formatRelativeTime(node.createdAt) + '</span>' +
          '</div>' +
          '<div class="score-panel">' +
            '<div class="score-item">' +
              '<span class="score-value importance">' + safeFixed(node.importanceWeight, 1) + '</span>' +
              '<span class="score-label">Importance</span>' +
            '</div>' +
            '<span class="score-divider">×</span>' +
            '<div class="score-item">' +
              '<span class="score-value temporal">' + safeFixed(node.temporalWeight, 3) + '</span>' +
              '<span class="score-label">Temporal</span>' +
            '</div>' +
            '<span class="score-divider">=</span>' +
            '<div class="score-item">' +
              '<span class="score-value total">' + safeFixed(effectiveScore, 2) + '</span>' +
              '<span class="score-label">' + (ignoreTemporalDecay ? 'Raw' : 'Score') + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="node-content">' + escapeHtml(node.content.slice(0, 250)) + (node.content.length > 250 ? '...' : '') + '</div>' +
        '<div class="node-tags">' + tagsHtml + '</div>' +
        '<div class="node-footer">' +
          '<span class="node-id">ID: ' + node.id.slice(0, 12) + '</span>' +
          contextHtml +
        '</div>' +
      '</div>';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Node Browser
    function renderNodeBrowser() {
      const typeFilter = document.getElementById('filter-type').value;
      const contextFilter = document.getElementById('filter-context').value;
      const textFilter = document.getElementById('filter-text').value.toLowerCase();
      const sortBy = document.getElementById('sort-by').value;

      let nodes = [...DATA.nodes];

      // Apply filters
      if (typeFilter) nodes = nodes.filter(n => n.type === typeFilter);
      if (contextFilter === 'included') nodes = nodes.filter(n => n.contextIncluded);
      if (contextFilter === 'excluded') nodes = nodes.filter(n => !n.contextIncluded);
      if (textFilter) nodes = nodes.filter(n =>
        n.content.toLowerCase().includes(textFilter) ||
        n.tags.some(t => t.toLowerCase().includes(textFilter))
      );

      // Sort
      if (sortBy === 'recent') {
        nodes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else if (sortBy === 'oldest') {
        nodes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      } else if (sortBy === 'importance' || ignoreTemporalDecay) {
        nodes.sort((a, b) => b.importanceWeight - a.importanceWeight);
      } else {
        nodes.sort((a, b) => b.totalScore - a.totalScore);
      }

      const html = nodes.length > 0
        ? nodes.slice(0, 100).map(n => renderNodeCard(n)).join('')
        : '<div class="empty-state">No nodes match your filters</div>';

      document.getElementById('node-list').innerHTML = html;
    }

    // Browser filter listeners
    ['filter-type', 'filter-context', 'filter-text', 'sort-by'].forEach(id => {
      document.getElementById(id).addEventListener('change', renderNodeBrowser);
      document.getElementById(id).addEventListener('input', renderNodeBrowser);
    });

    // Search Debugger
    function tokenize(text) {
      return text
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .toLowerCase()
        .replace(/([a-z])([0-9])/g, '$1 $2')
        .replace(/([0-9])([a-z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .replace(/[^a-z0-9\\s]/g, ' ')
        .split(/\\s+/)
        .filter(Boolean);
    }

    function embedTextLocal(text, dim = 256) {
      const vec = new Float32Array(dim);
      const tokens = tokenize(text);
      for (const t of tokens) {
        let h = 2166136261;
        for (let i = 0; i < t.length; i++) h = (h ^ t.charCodeAt(i)) * 16777619;
        const idx = Math.abs(h) % dim;
        vec[idx] += 1;
      }
      let norm = 0;
      for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < dim; i++) vec[i] /= norm;
      return vec;
    }

    function cosineSim(a, b) {
      if (a.length !== b.length) return 0;
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      return denom === 0 ? 0 : dot / denom;
    }

    function runSearchDebug() {
      const query = document.getElementById('search-query').value;
      const threshold = parseFloat(document.getElementById('threshold-slider').value);

      if (!query.trim()) {
        document.getElementById('search-results').innerHTML =
          '<div class="empty-state">Enter a query above to see similarity scores</div>';
        return;
      }

      const queryVec = embedTextLocal(query);

      const results = DATA.nodes.map(node => {
        let nodeVec;
        if (node.embedding && node.embedding.length === 256) {
          nodeVec = node.embedding;
        } else {
          nodeVec = embedTextLocal(node.content);
        }
        const similarity = cosineSim(queryVec, nodeVec);
        return { node, similarity };
      });

      results.sort((a, b) => b.similarity - a.similarity);

      const matchedCount = results.filter(r => r.similarity >= threshold).length;
      const belowCount = results.length - matchedCount;

      let html = '<div class="results-summary">' +
        'Query: "<strong>' + escapeHtml(query) + '</strong>" — ' +
        '<span style="color: var(--accent-green)">' + matchedCount + ' matched</span> · ' +
        '<span style="color: var(--accent-red)">' + belowCount + ' below threshold</span>' +
        '</div>';

      results.slice(0, 50).forEach(({ node, similarity }) => {
        const isMatched = similarity >= threshold;
        const scoreClass = similarity >= 0.5 ? 'high' : similarity >= 0.2 ? 'medium' : 'low';
        const statusClass = isMatched ? 'matched' : 'below';

        html += '<div class="result-card">' +
          '<div class="similarity-score ' + scoreClass + '">' + similarity.toFixed(2) + '</div>' +
          '<div class="result-content">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
              '<span class="node-type ' + node.type + '">' + node.type + '</span>' +
              '<span class="match-status ' + statusClass + '">' + (isMatched ? '✓ Matched' : '✗ Below') + '</span>' +
            '</div>' +
            '<div class="node-content" style="margin-bottom: 8px;">' + escapeHtml(node.content.slice(0, 180)) + '</div>' +
            '<div class="text-muted text-small">' + node.tags.slice(0, 4).join(' · ') + '</div>' +
          '</div>' +
        '</div>';
      });

      document.getElementById('search-results').innerHTML = html;
    }

    document.getElementById('search-query').addEventListener('keypress', e => {
      if (e.key === 'Enter') runSearchDebug();
    });

    document.getElementById('threshold-slider').addEventListener('input', e => {
      document.getElementById('threshold-value').textContent = e.target.value;
      runSearchDebug();
    });

    // Context Debugger
    function renderContextDebugger() {
      const ctx = DATA.contextSimulation;

      document.getElementById('ctx-included').textContent = ctx.includedIds.length;
      document.getElementById('ctx-excluded').textContent = ctx.excludedIds.length;
      document.getElementById('ctx-workstreams').textContent = ctx.summary.uniqueWorkStreams;
      document.getElementById('ctx-highvol').textContent = ctx.summary.highVolumePatterns.length;

      document.getElementById('included-count').textContent = ctx.includedIds.length;
      document.getElementById('excluded-count').textContent = ctx.excludedIds.length;

      const includedNodes = DATA.nodes.filter(n => ctx.includedIds.includes(n.id));
      const excludedNodes = DATA.nodes.filter(n => ctx.excludedIds.includes(n.id));

      document.getElementById('included-list').innerHTML =
        includedNodes.map(n => renderNodeCard(n, true)).join('') ||
        '<div class="empty-state">No nodes included</div>';

      document.getElementById('excluded-list').innerHTML =
        excludedNodes.slice(0, 50).map(n => renderNodeCard(n, true)).join('') ||
        '<div class="empty-state">No nodes excluded</div>';
    }

    // Initial render
    renderNodeBrowser();
    renderContextDebugger();
  </script>
</body>
</html>`;
}
export function setupDiagnosticTools(server, storage) {
    server.tool("kg_diagnostic", "Generate a diagnostic HTML dashboard for debugging knowledge graph context selection, search results, and node visibility. Opens in browser to help understand why certain nodes are included/excluded from context.", {
        project: z.string().optional()
            .describe("Filter to a specific project (optional)"),
        output_path: z.string().optional()
            .describe("Custom output path for the HTML file. Defaults to .kg/diagnostic.html"),
        open_browser: z.boolean().default(true).optional()
            .describe("Whether to open the dashboard in the default browser")
    }, async (args) => {
        const { project, output_path, open_browser = true } = args;
        logToolCall("kg_diagnostic", { project, output_path, open_browser });
        try {
            // Generate diagnostic data
            const data = generateDiagnosticData(storage, project);
            // Generate HTML
            const html = generateHtmlDashboard(data);
            // Determine output path
            const storagePath = storage.baseDir || ".kg";
            const outputFile = output_path || path.join(storagePath, "diagnostic.html");
            // Ensure directory exists
            const dir = path.dirname(outputFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Write file
            fs.writeFileSync(outputFile, html, "utf-8");
            // Open in browser if requested
            if (open_browser) {
                const { exec } = await import("node:child_process");
                const openCmd = process.platform === "darwin" ? "open" :
                    process.platform === "win32" ? "start" : "xdg-open";
                exec(`${openCmd} "${outputFile}"`);
            }
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            outputPath: outputFile,
                            metadata: data.metadata,
                            contextSimulation: {
                                included: data.contextSimulation.includedIds.length,
                                excluded: data.contextSimulation.excludedIds.length,
                                summary: data.contextSimulation.summary
                            }
                        }, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error instanceof Error ? error.message : String(error)
                        }, null, 2)
                    }
                ]
            };
        }
    });
}
