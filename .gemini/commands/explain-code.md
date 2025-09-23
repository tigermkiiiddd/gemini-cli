---
prompt: "Please provide a detailed explanation of the following code, including its purpose, how it works, and any potential improvements: {{args}}"
description: "Explains code snippets with detailed analysis"
tags: ["code-analysis", "documentation"]
author: "Gemini CLI"
---

# Code Explanation Command

This command provides detailed analysis and explanation of code snippets.

## Usage
```
/explain-code <code-snippet-or-file-path>
```

## Features
- Analyzes code structure and logic
- Explains the purpose and functionality
- Identifies potential improvements
- Provides context and best practices

## Examples
```
/explain-code function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }
/explain-code ./src/utils/helpers.js
```