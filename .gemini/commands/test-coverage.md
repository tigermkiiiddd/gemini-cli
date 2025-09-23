---
prompt: "Analyze the test coverage report and provide recommendations for improving test coverage: !{npm run test:coverage 2>&1} Please identify areas with low coverage and suggest specific test cases to add."
description: "Analyzes test coverage and provides improvement recommendations"
---

# Test Coverage Analysis Command

This command runs the test coverage report and provides AI-powered analysis and recommendations.

## Usage
```
/test-coverage
```

## Features
- Runs `npm run test:coverage` automatically
- Analyzes coverage percentages
- Identifies low-coverage areas
- Suggests specific test cases to add
- Provides actionable recommendations

## Prerequisites
- Project must have `test:coverage` script in package.json
- Testing framework must be configured