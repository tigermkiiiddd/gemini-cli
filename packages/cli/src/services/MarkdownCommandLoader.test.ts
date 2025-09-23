/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import mock from 'mock-fs';
import type { Config } from '@google/gemini-cli-core';
import { MarkdownCommandLoader } from './MarkdownCommandLoader.js';
import { Storage } from '@google/gemini-cli-core';
import {
  SHORTHAND_ARGS_PLACEHOLDER,
  type PromptPipelineContent,
} from './prompt-processors/types.js';
import {
  ShellProcessor,
} from './prompt-processors/shellProcessor.js';
import { AtFileProcessor } from './prompt-processors/atFileProcessor.js';
import { DefaultArgumentProcessor } from './prompt-processors/argumentProcessor.js';
import { createMockCommandContext } from '../test-utils/mockCommandContext.js';
import type { CommandContext } from '../ui/commands/types.js';

const mockShellProcess = vi.hoisted(() => vi.fn());
const mockAtFileProcess = vi.hoisted(() => vi.fn());
vi.mock('./prompt-processors/atFileProcessor.js', () => ({
  AtFileProcessor: vi.fn().mockImplementation(() => ({
    process: mockAtFileProcess,
  })),
}));
vi.mock('./prompt-processors/shellProcessor.js', () => ({
  ShellProcessor: vi.fn().mockImplementation(() => ({
    process: mockShellProcess,
  })),
  ConfirmationRequiredError: class extends Error {
    constructor(
      message: string,
      public commandsToConfirm: string[],
    ) {
      super(message);
      this.name = 'ConfirmationRequiredError';
    }
  },
}));

vi.mock('./prompt-processors/argumentProcessor.js', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('./prompt-processors/argumentProcessor.js')
    >();
  return {
    DefaultArgumentProcessor: vi
      .fn()
      .mockImplementation(() => new original.DefaultArgumentProcessor()),
  };
});
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    Storage: original.Storage,
    isCommandAllowed: vi.fn(),
    ShellExecutionService: {
      execute: vi.fn(),
    },
  };
});

describe('MarkdownCommandLoader', () => {
  const signal: AbortSignal = new AbortController().signal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShellProcess.mockImplementation(
      (prompt: PromptPipelineContent, context: CommandContext) => {
        const userArgsRaw = context?.invocation?.args || '';
        // This is a simplified mock. A real implementation would need to iterate
        // through all parts and process only the text parts.
        const firstTextPart = prompt.find(
          (p) => typeof p === 'string' || 'text' in p,
        );
        let textContent = '';
        if (typeof firstTextPart === 'string') {
          textContent = firstTextPart;
        } else if (firstTextPart && 'text' in firstTextPart) {
          textContent = firstTextPart.text ?? '';
        }

        const processedText = textContent.replaceAll(
          SHORTHAND_ARGS_PLACEHOLDER,
          userArgsRaw,
        );
        return Promise.resolve([{ text: processedText }]);
      },
    );
    mockAtFileProcess.mockImplementation(async (prompt: string) => prompt);
  });

  afterEach(() => {
    mock.restore();
  });

  it('loads a single command from a markdown file', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.md': `---
prompt: "This is a test prompt"
---

# Test Command

This is a test command description.`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('test');

    const result = await command.action?.(
      createMockCommandContext({
        invocation: {
          raw: '/test',
          name: 'test',
          args: '',
        },
      }),
      '',
    );
    if (result?.type === 'submit_prompt') {
      expect(result.content).toEqual([{ text: 'This is a test prompt' }]);
    } else {
      assert.fail('Incorrect action type');
    }
  });

  it('loads multiple commands', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test1.md': `---
prompt: "Prompt 1"
---

# Test 1`,
        'test2.md': `---
prompt: "Prompt 2"
---

# Test 2`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(2);
  });

  it('creates namespaces from nested directories', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        git: {
          'commit.md': `---
prompt: "git commit prompt"
---

# Git Commit`,
        },
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('git:commit');
  });

  it('creates deeply nested namespaces correctly', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();

    mock({
      [userCommandsDir]: {
        gcp: {
          pipelines: {
            'run.md': `---
prompt: "run pipeline"
---

# Run Pipeline`,
          },
        },
      },
    });
    const mockConfig = {
      getProjectRoot: vi.fn(() => '/path/to/project'),
      getExtensions: vi.fn(() => []),
      getFolderTrustFeature: vi.fn(() => false),
      getFolderTrust: vi.fn(() => false),
    } as unknown as Config;
    const loader = new MarkdownCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.name).toBe('gcp:pipelines:run');
  });

  it('returns both user and project commands in order', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    const projectCommandsDir = new Storage(
      process.cwd(),
    ).getProjectCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.md': `---
prompt: "User prompt"
---

# User Test`,
      },
      [projectCommandsDir]: {
        'test.md': `---
prompt: "Project prompt"
---

# Project Test`,
      },
    });

    const mockConfig = {
      getProjectRoot: vi.fn(() => process.cwd()),
      getExtensions: vi.fn(() => []),
      getFolderTrustFeature: vi.fn(() => false),
      getFolderTrust: vi.fn(() => false),
    } as unknown as Config;
    const loader = new MarkdownCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(2);
    const userResult = await commands[0].action?.(
      createMockCommandContext({
        invocation: {
          raw: '/test',
          name: 'test',
          args: '',
        },
      }),
      '',
    );
    if (userResult?.type === 'submit_prompt') {
      expect(userResult.content).toEqual([{ text: 'User prompt' }]);
    } else {
      assert.fail('Incorrect action type for user command');
    }
    const projectResult = await commands[1].action?.(
      createMockCommandContext({
        invocation: {
          raw: '/test',
          name: 'test',
          args: '',
        },
      }),
      '',
    );
    if (projectResult?.type === 'submit_prompt') {
      expect(projectResult.content).toEqual([{ text: 'Project prompt' }]);
    } else {
      assert.fail('Incorrect action type for project command');
    }
  });

  it('ignores files with invalid YAML front matter', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'invalid.md': `---
this is not valid yaml: [
---

# Invalid`,
        'good.md': `---
prompt: "This one is fine"
---

# Good`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('good');
  });

  it('ignores files that are semantically invalid (missing prompt)', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'no_prompt.md': `---
description: "This file is missing a prompt"
---

# No Prompt`,
        'good.md': `---
prompt: "This one is fine"
---

# Good`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('good');
  });

  it('handles filename edge cases correctly', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.v1.md': `---
prompt: "Test prompt"
---

# Test V1`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('test.v1');
  });

  it('handles file system errors gracefully', async () => {
    mock({}); // Mock an empty file system
    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    expect(commands).toHaveLength(0);
  });

  it('uses a default description if not provided', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.md': `---
prompt: "Test prompt"
---

# Test Command`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.description).toBe('Custom command from test.md');
  });

  it('uses the provided description from front matter', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.md': `---
prompt: "Test prompt"
description: "My test command"
---

# Test Command`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.description).toBe('My test command');
  });

  it('should sanitize colons in filenames to prevent namespace conflicts', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'legacy:command.md': `---
prompt: "This is a legacy command"
---

# Legacy Command`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('legacy_command');
  });

  it('handles markdown files without front matter', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'no-frontmatter.md': `# No Front Matter\n\nThis file has no YAML front matter.`,
        'good.md': `---
prompt: "This one is fine"
---

# Good`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('good');
  });

  it('processes shell injection triggers correctly', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'shell-test.md': `---
prompt: "Run command: !{echo hello}"
---

# Shell Test`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();

    await command.action?.(
      createMockCommandContext({
        invocation: {
          raw: '/shell-test',
          name: 'shell-test',
          args: '',
        },
      }),
      '',
    );

    expect(ShellProcessor).toHaveBeenCalledTimes(1);
    expect(AtFileProcessor).not.toHaveBeenCalled();
    expect(DefaultArgumentProcessor).toHaveBeenCalledTimes(1);
  });

  it('processes @-file injection correctly', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'file-test.md': `---
prompt: "Process file: @{file.txt}"
---

# File Test`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();

    await command.action?.(
      createMockCommandContext({
        invocation: {
          raw: '/file-test',
          name: 'file-test',
          args: '',
        },
      }),
      '',
    );

    expect(AtFileProcessor).toHaveBeenCalledTimes(1);
    expect(ShellProcessor).not.toHaveBeenCalled();
    expect(DefaultArgumentProcessor).toHaveBeenCalledTimes(1);
  });

  it('processes argument placeholders correctly', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'args-test.md': `---
prompt: "Process args: {{args}}"
---

# Args Test`,
      },
    });

    const loader = new MarkdownCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();

    await command.action?.(
      createMockCommandContext({
        invocation: {
          raw: '/args-test',
          name: 'args-test',
          args: 'test arguments',
        },
      }),
      'test arguments',
    );

    expect(AtFileProcessor).not.toHaveBeenCalled();
    expect(ShellProcessor).toHaveBeenCalledTimes(1);
    expect(DefaultArgumentProcessor).not.toHaveBeenCalled();
  });
});