/*
  GitHub utilities for Personal KG MCP
  - GitHub API integration for issue and PR status
  - Issue parsing using existing anchor patterns
  - Branch-to-issue extraction logic
  - Rate limiting and error handling
*/
import { execSync } from 'child_process';
// Check if gh CLI is available and authenticated
export function isGitHubCLIAvailable() {
    try {
        execSync('gh --version', { stdio: 'ignore' });
        execSync('gh auth status', { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
// Extract issue number from branch name using existing patterns
export function extractLinkedIssue(branch) {
    const patterns = [
        /(?:feat|fix|chore)\/(?:issue-)?(\d+)/,
        /(\d+)/,
    ];
    for (const pattern of patterns) {
        const match = branch.match(pattern);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    return null;
}
// Get current branch name
export function getCurrentBranch() {
    try {
        return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    }
    catch {
        return 'main';
    }
}
// Fetch issue data via gh CLI
export function fetchIssue(issueNumber) {
    try {
        const output = execSync(`gh issue view ${issueNumber} --json number,title,body,state,labels`, { encoding: 'utf8' });
        return JSON.parse(output);
    }
    catch {
        return null;
    }
}
// Fetch PR data for current branch
export function fetchPRForBranch(branch) {
    try {
        const output = execSync(`gh pr list --head ${branch} --json number,title,state,draft,labels`, { encoding: 'utf8' });
        const prs = JSON.parse(output);
        if (prs.length > 0) {
            const pr = prs[0];
            // Try to get CI status
            let ciStatus;
            try {
                const statusOutput = execSync(`gh pr checks ${pr.number} --json status,conclusion`, { encoding: 'utf8' });
                const checks = JSON.parse(statusOutput);
                const allPassing = checks.every((check) => check.conclusion === 'success' || check.status === 'completed');
                ciStatus = allPassing ? '✅ All checks passing' : '❌ Some checks failing';
            }
            catch {
                ciStatus = '⏳ Checks in progress';
            }
            return { ...pr, ciStatus };
        }
        return null;
    }
    catch {
        return null;
    }
}
// Extract anchored sections from issue body (same logic as CI workflows)
export function extractAnchoredBlock(body, startAnchor, endAnchor) {
    const startIdx = body.indexOf(startAnchor);
    const endIdx = body.indexOf(endAnchor);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx)
        return '';
    return body.slice(startIdx + startAnchor.length, endIdx);
}
// Parse checklist items (same logic as CI workflows)
export function parseChecklist(sectionText) {
    const lines = (sectionText || '').split('\n');
    const items = [];
    for (const rawLine of lines) {
        const match = rawLine.match(/^\s*-\s*\[(\s|x)\]\s*(.*)$/i);
        if (!match)
            continue;
        const content = match[2].trim();
        const idMatch = content.match(/\(id:\s*([a-z0-9_-]+)\)/i);
        const childMatch = content.match(/\(child:\s*#(\d+)\)/i);
        items.push({
            id: idMatch ? idMatch[1] : null,
            text: content.replace(/\(id:\s*[a-z0-9_-]+\)/i, '').replace(/\(child:\s*#\d+\)/i, '').trim(),
            checked: /\[x\]/i.test(match[0]),
            child: childMatch ? Number(childMatch[1]) : null,
        });
    }
    return items;
}
// Analyze issue completion status
export function analyzeIssueStatus(issue) {
    const sections = {
        'PROJECT_TOOLS': { start: '<!-- PHASE:PROJECT_TOOLS:start -->', end: '<!-- PHASE:PROJECT_TOOLS:end -->' },
        'INTEGRATION': { start: '<!-- PHASE:INTEGRATION:start -->', end: '<!-- PHASE:INTEGRATION:end -->' },
        'FINAL_VALIDATION': { start: '<!-- PHASE:FINAL_VALIDATION:start -->', end: '<!-- PHASE:FINAL_VALIDATION:end -->' },
        'QA': { start: '<!-- PHASE:QA:start -->', end: '<!-- PHASE:QA:end -->' },
        'SUCCESS_CRITERIA': { start: '<!-- PHASE:SUCCESS_CRITERIA:start -->', end: '<!-- PHASE:SUCCESS_CRITERIA:end -->' },
    };
    const sectionStats = {};
    const allCheckedItems = [];
    const allRemainingItems = [];
    for (const [sectionName, anchors] of Object.entries(sections)) {
        const block = extractAnchoredBlock(issue.body, anchors.start, anchors.end);
        const items = parseChecklist(block);
        const checked = items.filter(item => item.checked);
        const remaining = items.filter(item => !item.checked);
        sectionStats[sectionName] = {
            checked: checked.length,
            total: items.length
        };
        checked.forEach(item => {
            if (item.id)
                allCheckedItems.push(`${sectionName.toLowerCase()}:${item.id}`);
        });
        remaining.forEach(item => {
            if (item.id)
                allRemainingItems.push(`${sectionName.toLowerCase()}:${item.id}`);
        });
    }
    const totalChecked = Object.values(sectionStats).reduce((sum, stat) => sum + stat.checked, 0);
    const totalItems = Object.values(sectionStats).reduce((sum, stat) => sum + stat.total, 0);
    return {
        number: issue.number,
        title: issue.title,
        status: issue.state,
        checkedItems: allCheckedItems,
        remainingItems: allRemainingItems,
        totalProgress: `${totalChecked}/${totalItems} items completed`,
        sections: sectionStats
    };
}
// Generate suggested commands based on remaining items
export function generateSuggestedCommands(issueStatus) {
    const commands = [];
    commands.push('/final-status                    # See detailed remaining items');
    // Add specific check commands for remaining items (limit to 5)
    issueStatus.remainingItems.slice(0, 5).forEach(itemId => {
        const [section, id] = itemId.split(':');
        if (id) {
            commands.push(`/final-check ${id}            # Mark ${section} complete`);
        }
    });
    return commands;
}
// Detect discrepancies between KG claims and GitHub reality
export function detectDiscrepancies(kgRecentWork, issueStatus) {
    const discrepancies = [];
    // Look for completion claims in recent KG work
    const completionClaims = kgRecentWork
        .filter(node => node.content && typeof node.content === 'string')
        .filter(node => node.content.toLowerCase().includes('completed') ||
        node.content.toLowerCase().includes('finished') ||
        node.content.toLowerCase().includes('done'));
    if (completionClaims.length > 0 && issueStatus.remainingItems.length > 0) {
        const claimText = completionClaims[0].content.substring(0, 50);
        discrepancies.push(`KG claims '${claimText}...'`, `GitHub shows ${issueStatus.remainingItems.length} items still unchecked`, `🎯 Action Required: Verify actual completion state before proceeding`);
    }
    return discrepancies;
}
// Main function to get GitHub state for session warmup
export function getGitHubState(currentBranch, kgRecentWork = []) {
    if (!isGitHubCLIAvailable()) {
        return null;
    }
    const issueNumber = extractLinkedIssue(currentBranch);
    if (!issueNumber) {
        return null;
    }
    const issue = fetchIssue(issueNumber);
    if (!issue) {
        return null;
    }
    const issueStatus = analyzeIssueStatus(issue);
    const currentPR = fetchPRForBranch(currentBranch);
    const suggestedCommands = generateSuggestedCommands(issueStatus);
    const discrepancies = detectDiscrepancies(kgRecentWork, issueStatus);
    return {
        currentBranch,
        currentIssue: issueStatus,
        currentPR,
        suggestedCommands,
        discrepancies
    };
}
