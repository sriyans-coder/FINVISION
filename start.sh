#!/bin/bash
# FinVision - Financial Goal Tracker
# Quick start script

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   💰  FinVision - Financial Goal Tracker     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Kill any process on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

echo "➡️  Starting server on http://localhost:3000"
echo "   Press Ctrl+C to stop"
echo ""

python3 "$(dirname "$0")/server.py"
