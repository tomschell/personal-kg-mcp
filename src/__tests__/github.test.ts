import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import {
  isGitHubCLIAvailable,
  extractLinkedIssue,
  getCurrentBranch,
  fetchIssue,
  fetchPRForBranch,
  extractAnchoredBlock,
  parseChecklist,
  analyzeIssueStatus,
  generateSuggestedCommands,
  detectDiscrepancies,
  getGitHubState
} from '../utils/github.js';

// Mock child_process.execSync
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

describe('GitHub Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isGitHubCLIAvailable', () => {
    it('should return true when gh CLI is available and authenticated', () => {
      (execSync as any).mockReturnValueOnce('gh version 2.0.0');
      (execSync as any).mockReturnValueOnce('✓ Logged in to github.com as user');
      
      expect(isGitHubCLIAvailable()).toBe(true);
    });

    it('should return false when gh CLI is not available', () => {
      (execSync as any).mockImplementationOnce(() => {
        throw new Error('command not found');
      });
      
      expect(isGitHubCLIAvailable()).toBe(false);
    });

    it('should return false when gh CLI is not authenticated', () => {
      (execSync as any).mockReturnValueOnce('gh version 2.0.0');
      (execSync as any).mockImplementationOnce(() => {
        throw new Error('not logged in');
      });
      
      expect(isGitHubCLIAvailable()).toBe(false);
    });
  });

  describe('extractLinkedIssue', () => {
    it('should extract issue number from feat branch', () => {
      expect(extractLinkedIssue('feat/306-github-integration')).toBe(306);
    });

    it('should extract issue number from fix branch', () => {
      expect(extractLinkedIssue('fix/issue-123')).toBe(123);
    });

    it('should extract issue number from chore branch', () => {
      expect(extractLinkedIssue('chore/456')).toBe(456);
    });

    it('should return null for main branch', () => {
      expect(extractLinkedIssue('main')).toBe(null);
    });

    it('should return null for branch without issue number', () => {
      expect(extractLinkedIssue('feature/some-feature')).toBe(null);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', () => {
      (execSync as any).mockReturnValueOnce('feat/306-github-integration');
      
      expect(getCurrentBranch()).toBe('feat/306-github-integration');
    });

    it('should return main when git command fails', () => {
      (execSync as any).mockImplementationOnce(() => {
        throw new Error('not a git repository');
      });
      
      expect(getCurrentBranch()).toBe('main');
    });
  });

  describe('fetchIssue', () => {
    it('should fetch issue data successfully', () => {
      const mockIssue = {
        number: 306,
        title: 'KG: Add GitHub state integration to session warmup',
        body: '## Test Issue\n\n<!-- PHASE:FINAL_VALIDATION:start -->\n- [ ] Test item 1 (id: test-1)\n- [x] Test item 2 (id: test-2)\n<!-- PHASE:FINAL_VALIDATION:end -->',
        state: 'open',
        labels: ['enhancement', 'personal-kg']
      };
      
      (execSync as any).mockReturnValueOnce(JSON.stringify(mockIssue));
      
      const result = fetchIssue(306);
      expect(result).toEqual(mockIssue);
    });

    it('should return null when issue fetch fails', () => {
      (execSync as any).mockImplementationOnce(() => {
        throw new Error('issue not found');
      });
      
      expect(fetchIssue(999)).toBe(null);
    });
  });

  describe('extractAnchoredBlock', () => {
    it('should extract content between anchors', () => {
      const body = 'Some content\n<!-- PHASE:FINAL_VALIDATION:start -->\n- [ ] Item 1\n- [x] Item 2\n<!-- PHASE:FINAL_VALIDATION:end -->\nMore content';
      
      const result = extractAnchoredBlock(
        body,
        '<!-- PHASE:FINAL_VALIDATION:start -->',
        '<!-- PHASE:FINAL_VALIDATION:end -->'
      );
      
      expect(result.trim()).toBe('- [ ] Item 1\n- [x] Item 2');
    });

    it('should return empty string when start anchor not found', () => {
      const body = 'Some content\n<!-- PHASE:FINAL_VALIDATION:end -->\nMore content';
      
      const result = extractAnchoredBlock(
        body,
        '<!-- PHASE:FINAL_VALIDATION:start -->',
        '<!-- PHASE:FINAL_VALIDATION:end -->'
      );
      
      expect(result).toBe('');
    });

    it('should return empty string when end anchor not found', () => {
      const body = 'Some content\n<!-- PHASE:FINAL_VALIDATION:start -->\n- [ ] Item 1\nMore content';
      
      const result = extractAnchoredBlock(
        body,
        '<!-- PHASE:FINAL_VALIDATION:start -->',
        '<!-- PHASE:FINAL_VALIDATION:end -->'
      );
      
      expect(result).toBe('');
    });
  });

  describe('parseChecklist', () => {
    it('should parse checklist items correctly', () => {
      const sectionText = `
- [ ] Test item 1 (id: test-1)
- [x] Test item 2 (id: test-2)
- [ ] Test item 3 (id: test-3) (child: #123)
- [x] Test item 4 (id: test-4)
      `;
      
      const result = parseChecklist(sectionText);
      
      expect(result).toEqual([
        {
          id: 'test-1',
          text: 'Test item 1',
          checked: false,
          child: null
        },
        {
          id: 'test-2',
          text: 'Test item 2',
          checked: true,
          child: null
        },
        {
          id: 'test-3',
          text: 'Test item 3',
          checked: false,
          child: 123
        },
        {
          id: 'test-4',
          text: 'Test item 4',
          checked: true,
          child: null
        }
      ]);
    });

    it('should handle items without IDs', () => {
      const sectionText = `
- [ ] Test item without ID
- [x] Another item without ID
      `;
      
      const result = parseChecklist(sectionText);
      
      expect(result).toEqual([
        {
          id: null,
          text: 'Test item without ID',
          checked: false,
          child: null
        },
        {
          id: null,
          text: 'Another item without ID',
          checked: true,
          child: null
        }
      ]);
    });
  });

  describe('analyzeIssueStatus', () => {
    it('should analyze issue status correctly', () => {
      const issue = {
        number: 306,
        title: 'Test Issue',
        body: `
## Test Issue

<!-- PHASE:PROJECT_TOOLS:start -->
- [x] Tool 1 (id: pt-tool1)
- [x] Tool 2 (id: pt-tool2)
<!-- PHASE:PROJECT_TOOLS:end -->

<!-- PHASE:FINAL_VALIDATION:start -->
- [ ] Validation 1 (id: fv-valid1)
- [x] Validation 2 (id: fv-valid2)
- [ ] Validation 3 (id: fv-valid3)
<!-- PHASE:FINAL_VALIDATION:end -->
        `,
        state: 'open',
        labels: ['enhancement']
      };
      
      const result = analyzeIssueStatus(issue);
      
      expect(result.number).toBe(306);
      expect(result.title).toBe('Test Issue');
      expect(result.status).toBe('open');
      expect(result.totalProgress).toBe('3/5 items completed');
      expect(result.checkedItems).toContain('project_tools:pt-tool1');
      expect(result.checkedItems).toContain('project_tools:pt-tool2');
      expect(result.checkedItems).toContain('final_validation:fv-valid2');
      expect(result.remainingItems).toContain('final_validation:fv-valid1');
      expect(result.remainingItems).toContain('final_validation:fv-valid3');
      expect(result.sections.PROJECT_TOOLS).toEqual({ checked: 2, total: 2 });
      expect(result.sections.FINAL_VALIDATION).toEqual({ checked: 1, total: 3 });
    });
  });

  describe('generateSuggestedCommands', () => {
    it('should generate suggested commands for remaining items', () => {
      const issueStatus = {
        number: 306,
        title: 'Test Issue',
        status: 'open' as const,
        checkedItems: ['project_tools:pt-tool1'],
        remainingItems: ['final_validation:fv-valid1', 'final_validation:fv-valid2'],
        totalProgress: '1/3 items completed',
        sections: {
          PROJECT_TOOLS: { checked: 1, total: 1 },
          FINAL_VALIDATION: { checked: 0, total: 2 }
        }
      };
      
      const result = generateSuggestedCommands(issueStatus);
      
      expect(result).toContain('/final-status                    # See detailed remaining items');
      expect(result).toContain('/final-check fv-valid1            # Mark final_validation complete');
      expect(result).toContain('/final-check fv-valid2            # Mark final_validation complete');
    });
  });

  describe('detectDiscrepancies', () => {
    it('should detect discrepancies between KG claims and GitHub reality', () => {
      const kgRecentWork = [
        {
          content: 'Successfully completed all validation items for issue #306'
        }
      ];
      
      const issueStatus = {
        number: 306,
        title: 'Test Issue',
        status: 'open' as const,
        checkedItems: ['project_tools:pt-tool1'],
        remainingItems: ['final_validation:fv-valid1', 'final_validation:fv-valid2'],
        totalProgress: '1/3 items completed',
        sections: {}
      };
      
      const result = detectDiscrepancies(kgRecentWork, issueStatus);
      
      expect(result).toContain("KG claims 'Successfully completed all validation items for is...'");
      expect(result).toContain('GitHub shows 2 items still unchecked');
      expect(result).toContain('🎯 Action Required: Verify actual completion state before proceeding');
    });

    it('should not detect discrepancies when KG and GitHub align', () => {
      const kgRecentWork = [
        {
          content: 'Started work on issue #306'
        }
      ];
      
      const issueStatus = {
        number: 306,
        title: 'Test Issue',
        status: 'open' as const,
        checkedItems: [],
        remainingItems: ['final_validation:fv-valid1'],
        totalProgress: '0/1 items completed',
        sections: {}
      };
      
      const result = detectDiscrepancies(kgRecentWork, issueStatus);
      
      expect(result).toHaveLength(0);
    });
  });

  describe('getGitHubState', () => {
    it('should return null when GitHub CLI is not available', () => {
      (execSync as any).mockImplementationOnce(() => {
        throw new Error('command not found');
      });
      
      const result = getGitHubState('feat/306-github-integration');
      
      expect(result).toBe(null);
    });

    it('should return null when no issue is linked to branch', () => {
      (execSync as any).mockReturnValueOnce('gh version 2.0.0');
      (execSync as any).mockReturnValueOnce('✓ Logged in to github.com as user');
      
      const result = getGitHubState('main');
      
      expect(result).toBe(null);
    });

    it('should return GitHub state when everything is available', () => {
      const mockIssue = {
        number: 306,
        title: 'Test Issue',
        body: '<!-- PHASE:FINAL_VALIDATION:start -->\n- [ ] Test item (id: test-1)\n<!-- PHASE:FINAL_VALIDATION:end -->',
        state: 'open',
        labels: ['enhancement']
      };
      
      (execSync as any)
        .mockReturnValueOnce('gh version 2.0.0')
        .mockReturnValueOnce('✓ Logged in to github.com as user')
        .mockReturnValueOnce(JSON.stringify(mockIssue))
        .mockReturnValueOnce('[]'); // No PRs
      
      const result = getGitHubState('feat/306-github-integration');
      
      expect(result).not.toBe(null);
      expect(result?.currentBranch).toBe('feat/306-github-integration');
      expect(result?.currentIssue?.number).toBe(306);
      expect(result?.suggestedCommands).toContain('/final-status                    # See detailed remaining items');
    });
  });
});
