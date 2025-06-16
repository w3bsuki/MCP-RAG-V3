# Multi-Agent Claude Code Development System

A 3-agent autonomous development system that converts PRDs into production-ready applications through parallel development in isolated git worktrees.

## Quick Start

```bash
# 1. Run the setup script
./launch-agents.sh

# 2. Start agents in separate terminals:
# Terminal 1 - Builder:
cd agents/builder && claude --mcp-config ../../.mcp/config.json

# Terminal 2 - Validator:  
cd agents/validator && claude --mcp-config ../../.mcp/config.json

# Terminal 3 - Architect:
cd agents/architect && claude --mcp-config ../../.mcp/config.json
```

## Architecture

- **Architect Agent**: Requirements analysis, system design, coordination
- **Builder Agent**: Full-stack implementation
- **Validator Agent**: Testing and quality assurance

## Coordination

Agents coordinate through shared documents:
- `coordination/PROJECT_PLAN.md` - Master planning document
- `coordination/task-board.json` - Task assignments and progress
- `coordination/progress-log.md` - Daily updates

## Git Workflow

Each agent works in an isolated git worktree to enable true parallel development without conflicts.