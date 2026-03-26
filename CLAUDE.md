# CLAUDE.md

This file provides guidance for AI assistants (Claude and others) working in this repository.

## Project Overview

**Repository:** `huttonhomehub/fuzzy-guide`

This is a new project. As the codebase evolves, update this file to reflect the actual purpose, stack, and architecture.

> **Note for AI assistants:** This repository was initialized empty. When the project stack and purpose are established, update this file accordingly.

## Repository Structure

_To be documented once the project structure is established._

A typical layout to aim for:

```
fuzzy-guide/
├── CLAUDE.md          # This file
├── README.md          # User-facing documentation
├── src/               # Main source code
├── tests/             # Test files
├── docs/              # Additional documentation
└── .github/           # GitHub Actions workflows
```

## Development Workflow

### Branching

- **`master`** — stable, production-ready code; never push directly without a review
- **`claude/<description>-<id>`** — branches created by AI assistants for specific tasks
- **Feature branches** — use descriptive names: `feat/short-description`, `fix/issue-description`

### Commits

- Use concise, imperative commit messages: `add user auth`, `fix login redirect`, `docs: update README`
- Keep commits focused — one logical change per commit
- Reference issues when relevant: `fix: handle null user (#42)`

### Pull Requests

- All changes to `master` go through a PR
- Include a description of what changed and why
- AI assistants should create a PR and notify the user rather than merging directly

## Key Conventions

_To be updated once the language/framework is chosen._

General principles to follow regardless of stack:

- **Consistency** — follow the patterns already established in the codebase
- **Minimal changes** — fix the problem at hand; don't refactor surrounding code unless asked
- **No unnecessary files** — don't create files that aren't needed for the task
- **No speculative features** — implement what was asked, not what might be useful later
- **Security** — never commit secrets, credentials, or `.env` files; validate at system boundaries

## Testing

_To be documented once tests are set up._

```bash
# Run all tests (update once test framework is chosen)
# npm test / pytest / go test ./... / cargo test
```

- Write tests for new functionality
- Ensure existing tests pass before committing
- AI assistants should run tests before pushing

## Build & Run

_To be documented once the project is set up._

```bash
# Install dependencies (update once stack is chosen)
# npm install / pip install -r requirements.txt / go mod download

# Run in development
# npm run dev / python main.py / go run .

# Build for production
# npm run build / docker build .
```

## Environment Setup

_To be documented once configuration is needed._

- Copy `.env.example` to `.env` (once it exists) and fill in required values
- Never commit `.env` or files containing real secrets
- Document all required environment variables in `.env.example`

## AI Assistant Guidelines

### Branch
Always develop on the branch specified at the start of your session. If none is specified, create a `claude/<short-description>-<id>` branch off `master`.

### Workflow
1. Read relevant files before making changes — understand existing patterns first
2. Make focused, minimal changes scoped to the task
3. Run tests before committing (once tests exist)
4. Commit with a clear message describing what and why
5. Push to the working branch; do NOT push to `master` directly
6. Do NOT create a pull request unless explicitly asked

### Do
- Follow the code style already present in the file you're editing
- Reuse existing utilities and patterns rather than introducing new abstractions
- Ask for clarification when requirements are ambiguous

### Don't
- Don't add error handling, comments, or refactors beyond what was asked
- Don't introduce new dependencies without discussing it first
- Don't create backup files, scratch files, or temporary documentation
- Don't guess at environment-specific values (ports, hostnames, credentials)

## Updating This File

Keep this file current as the project evolves:
- When the stack is chosen, replace the placeholder sections with real commands
- When patterns are established, document them explicitly
- When new contributors (human or AI) need context, add it here
