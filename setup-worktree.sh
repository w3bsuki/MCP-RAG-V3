#!/bin/bash
# Automated worktree environment setup script

setup_worktree() {
  local worktree_path=$1
  echo "Setting up worktree: $worktree_path"
  
  cd "$worktree_path" || exit 1
  
  # Check for package.json and install dependencies
  if [ -f "package.json" ]; then
    echo "Installing npm dependencies..."
    npm install
  else
    echo "No package.json found, skipping npm install"
  fi
  
  # Copy shared environment variables if they exist
  if [ -f "../../shared/.env" ]; then
    echo "Copying shared .env file..."
    cp ../../shared/.env .
  else
    echo "No shared .env file to copy"
  fi
  
  # Copy coordination documents
  echo "Copying coordination documents..."
  cp ../../coordination/PROJECT_PLAN.md . 2>/dev/null || echo "PROJECT_PLAN.md not found"
  
  # Create symlink to shared resources
  if [ ! -L "shared" ]; then
    ln -s ../../shared shared
    echo "Created symlink to shared resources"
  fi
  
  # Create local directories
  mkdir -p .cache logs
  
  echo "Worktree setup complete for: $worktree_path"
  echo "---"
}

# Setup all worktrees if called without arguments
if [ $# -eq 0 ]; then
  echo "Setting up all agent worktrees..."
  setup_worktree "./agents/architect"
  setup_worktree "./agents/builder"
  setup_worktree "./agents/validator"
  echo "All worktrees configured successfully!"
else
  setup_worktree "$1"
fi