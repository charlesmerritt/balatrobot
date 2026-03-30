#!/usr/bin/env bash
# dev.sh — Make-compatible dev task runner for environments without make (e.g. Steam Deck).
# Usage: ./scripts/dev.sh <target>
# Mirrors the targets in the project Makefile.

set -euo pipefail

YELLOW='\033[33m'
GREEN='\033[32m'
BLUE='\033[34m'
RESET='\033[0m'

MAX_XDIST="${MAX_XDIST:-6}"
XDIST_WORKERS=$(python -c "import multiprocessing as mp; print(min(mp.cpu_count(), $MAX_XDIST))")

print_msg() { printf "%b\n" "$1"; }

cmd_help() {
    print_msg "${BLUE}BalatroBot Development Tasks${RESET}"
    print_msg ""
    print_msg "${YELLOW}Available targets:${RESET}"
    printf "  ${GREEN}%-18s${RESET} %s\n" "help"      "Show this help message"
    printf "  ${GREEN}%-18s${RESET} %s\n" "install"   "Install balatrobot and all dependencies (including dev)"
    printf "  ${GREEN}%-18s${RESET} %s\n" "lint"      "Run ruff linter (check only)"
    printf "  ${GREEN}%-18s${RESET} %s\n" "format"    "Run formatters (ruff, mdformat, stylua)"
    printf "  ${GREEN}%-18s${RESET} %s\n" "typecheck" "Run type checkers (Python and Lua)"
    printf "  ${GREEN}%-18s${RESET} %s\n" "quality"   "Run all code quality checks"
    printf "  ${GREEN}%-18s${RESET} %s\n" "fixtures"  "Generate fixtures"
    printf "  ${GREEN}%-18s${RESET} %s\n" "test"      "Run all tests"
    printf "  ${GREEN}%-18s${RESET} %s\n" "all"       "Run all code quality checks and tests"
}

cmd_install() {
    print_msg "${YELLOW}Installing all dependencies...${RESET}"
    uv sync --group dev --group test
}

cmd_lint() {
    print_msg "${YELLOW}Running ruff linter...${RESET}"
    ruff check --fix --select I .
    ruff check --fix .
}

cmd_format() {
    print_msg "${YELLOW}Running ruff formatter...${RESET}"
    ruff check --select I --fix .
    ruff format .
    print_msg "${YELLOW}Running mdformat formatter...${RESET}"
    mdformat ./docs README.md CLAUDE.md .claude/skills/balatrobot/SKILL.md
    if command -v stylua >/dev/null 2>&1; then
        print_msg "${YELLOW}Running stylua formatter...${RESET}"
        stylua src/lua
    else
        print_msg "${BLUE}Skipping stylua formatter (stylua not found)${RESET}"
    fi
}

cmd_typecheck() {
    print_msg "${YELLOW}Running Python type checker...${RESET}"
    ty check
    if command -v lua-language-server >/dev/null 2>&1 && [ -f .luarc.json ]; then
        print_msg "${YELLOW}Running Lua type checker...${RESET}"
        lua-language-server --check balatrobot.lua src/lua \
            --configpath="$(pwd)/.luarc.json" 2>/dev/null
    else
        print_msg "${BLUE}Skipping Lua type checker (lua-language-server not found or .luarc.json missing)${RESET}"
    fi
}

cmd_quality() {
    cmd_lint
    cmd_typecheck
    cmd_format
    print_msg "${GREEN}All checks completed${RESET}"
}

cmd_fixtures() {
    print_msg "${YELLOW}Generating all fixtures...${RESET}"
    if ! python tests/fixtures/generate.py; then
        print_msg "${RED}Fixture generation failed. Make sure BalatroBot is already running and reachable, then try again.${RESET}"
        return 1
    fi
}

cmd_test() {
    print_msg "${YELLOW}Running tests/cli with 2 workers...${RESET}"
    pytest -n 2 tests/cli
    print_msg "${YELLOW}Running tests/lua with ${XDIST_WORKERS} workers...${RESET}"
    pytest -n "${XDIST_WORKERS}" tests/lua
}

cmd_all() {
    cmd_lint
    cmd_format
    cmd_typecheck
    cmd_test
    print_msg "${GREEN}All checks and tests completed${RESET}"
}

target="${1:-help}"
case "$target" in
    help|install|lint|format|typecheck|quality|fixtures|test|all)
        "cmd_${target}"
        ;;
    *)
        print_msg "\033[31mUnknown target: ${target}${RESET}"
        cmd_help
        exit 1
        ;;
esac
