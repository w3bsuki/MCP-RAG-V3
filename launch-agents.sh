#!/bin/bash
# Launch script for multi-agent system

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Multi-Agent Development System Launcher${NC}"
echo "========================================"

# Check if MCP config exists
if [ ! -f ".mcp/config.json" ]; then
  echo -e "${YELLOW}Warning: MCP config not found!${NC}"
  exit 1
fi

# Build MCP server if needed
if [ ! -f ".mcp/server.js" ]; then
  echo -e "${YELLOW}Building MCP server...${NC}"
  cd .mcp && npm install && npx tsc && cd ..
fi

# Setup worktrees
echo -e "${GREEN}Setting up agent worktrees...${NC}"
./setup-worktree.sh

# Instructions for launching agents
echo ""
echo -e "${GREEN}Setup complete! To launch the agents:${NC}"
echo ""
echo "1. Start the MCP RAG server (optional - for shared context):"
echo "   cd .mcp && npm start"
echo ""
echo "2. Launch Builder agent in a new terminal:"
echo "   cd agents/builder"
echo "   claude --mcp-config ../../.mcp/config.json"
echo ""
echo "3. Launch Validator agent in another terminal:"
echo "   cd agents/validator"
echo "   claude --mcp-config ../../.mcp/config.json"
echo ""
echo "4. The Architect agent runs in this terminal:"
echo "   cd agents/architect"
echo "   claude --mcp-config ../../.mcp/config.json"
echo ""
echo -e "${BLUE}Remember:${NC}"
echo "- Each agent works in its own git worktree"
echo "- Coordination happens through PROJECT_PLAN.md and task-board.json"
echo "- Use git commands to monitor progress across worktrees"
echo ""