---
prompt: "Please review the following file for code quality, potential issues, and improvements: @{{{args}}} Provide specific recommendations and best practices."
description: "Reviews a specific file for code quality and improvements"
tags: ["code-review", "quality-assurance"]
author: "Gemini CLI"
---

# File Review Command

This command performs comprehensive code review of specified files.

## Usage
```
/review-file <file-path>
```

## Features
- Automatically reads and analyzes the specified file
- Checks for code quality issues
- Suggests improvements and best practices
- Identifies potential bugs or security issues

## Examples
```
/review-file src/components/UserProfile.tsx
/review-file api/routes/auth.js
```

## File Injection
This command uses the `@{}` syntax to automatically inject file contents into the prompt.