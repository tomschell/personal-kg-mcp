# Hook Setup for Auto-Capture and Context Injection

The personal-kg-mcp now includes tools that enable intelligent context management. To make these fully automatic, you can set up Claude Code hooks.

## New MCP Tools Available

### kg_get_relevant_context
Retrieves relevant past context for a given query. Use before starting work on a topic.

```
kg_get_relevant_context(query="implementing auth", project="my-app")
```

Returns:
- Brief context summary (1-2 sentences)
- Related decisions, insights, and open questions
- Relevance scores

### kg_open_questions
Lists unresolved questions with aging information.

```
kg_open_questions(project="my-app")
```

### kg_resolve_question
Marks a question as resolved.

```
kg_resolve_question(question_id="...", resolved_by_id="...")
```

## Hook Configuration (Optional)

### Proactive Context Injection

Add to your Claude Code settings to automatically inject context on each prompt:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Before proceeding, use kg_get_relevant_context with the user's message to check for relevant prior decisions or open questions. If found, briefly mention them.",
            "timeout": 15
          }
        ],
        "matcher": "*"
      }
    ]
  }
}
```

### Auto-Capture Decisions

Add to capture decisions automatically when Claude stops:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Review this session. If any architectural decisions, technology choices, or important insights were made, use kg_capture to record them. Also capture any unresolved questions.",
            "timeout": 30
          }
        ],
        "matcher": "*"
      }
    ]
  }
}
```

## Contradiction Detection

Contradiction detection is automatic! When you capture a decision using kg_capture:

1. System searches for similar past decisions
2. If contradictions detected (>50% likelihood), warnings are returned
3. A `conflicts_with` edge is created between the nodes

Example output:
```json
{
  "accepted": true,
  "node": { ... },
  "warnings": [{
    "type": "potential_contradiction",
    "likelihood": 0.75,
    "conflictsWith": {
      "id": "abc123",
      "snippet": "Previously decided to use PostgreSQL for..."
    },
    "reasons": ["Rejects what was previously adopted: postgresql"]
  }],
  "message": "Warning: 1 potential contradiction(s) detected with past decisions."
}
```

## Testing the Features

1. **Test context retrieval:**
   ```
   kg_get_relevant_context(query="database selection")
   ```

2. **Test open questions:**
   ```
   kg_capture(content="Should we use Redis or Memcached?", type="question", project="my-app")
   kg_open_questions(project="my-app")
   ```

3. **Test contradiction detection:**
   ```
   kg_capture(content="Decided to use PostgreSQL for the database", type="decision")
   kg_capture(content="Decided to avoid PostgreSQL and use MongoDB instead", type="decision")
   # Second capture should show contradiction warning
   ```
