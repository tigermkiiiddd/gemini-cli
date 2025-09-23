---
prompt: "Based on the following staged changes, generate a professional Git commit message following conventional commit format: !{git diff --cached} Please provide a clear, concise commit message that accurately describes the changes."
description: "Generates professional Git commit messages based on staged changes"
tags: ["git", "commit", "automation"]
author: "Gemini CLI"
---

# Git Commit Message Generator

This command analyzes staged Git changes and generates professional commit messages.

## Usage
```
/git:commit-message
```

## Features
- Automatically runs `git diff --cached` to analyze staged changes
- Generates commit messages following conventional commit format
- Provides clear, descriptive commit messages
- Follows best practices for commit message structure

## Prerequisites
- Must be run in a Git repository
- Changes must be staged (`git add` files first)

## Conventional Commit Format
The generated messages follow the format:
```
type(scope): description

[optional body]

[optional footer]
```

Common types: feat, fix, docs, style, refactor, test, chore