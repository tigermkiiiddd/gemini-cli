/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { glob } from 'glob';
import { z } from 'zod';
import type { Config } from '@google/gemini-cli-core';
import { Storage } from '@google/gemini-cli-core';
import type { ICommandLoader } from './types.js';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from '../ui/commands/types.js';
import { CommandKind } from '../ui/commands/types.js';
import { DefaultArgumentProcessor } from './prompt-processors/argumentProcessor.js';
import type {
  IPromptProcessor,
  PromptPipelineContent,
} from './prompt-processors/types.js';
import {
  SHORTHAND_ARGS_PLACEHOLDER,
  SHELL_INJECTION_TRIGGER,
  AT_FILE_INJECTION_TRIGGER,
} from './prompt-processors/types.js';
import {
  ConfirmationRequiredError,
  ShellProcessor,
} from './prompt-processors/shellProcessor.js';
import { AtFileProcessor } from './prompt-processors/atFileProcessor.js';

interface CommandDirectory {
  path: string;
  extensionName?: string;
}

/**
 * Defines the Zod schema for a Markdown command definition file's front matter.
 * This serves as the single source of truth for both validation and type inference.
 */
const MarkdownCommandDefSchema = z.object({
  prompt: z.string(), // Required field - the actual command prompt
  description: z.string().optional(),
  // Additional metadata can be added here in the future
  tags: z.array(z.string()).optional(),
  author: z.string().optional(),
});

/**
 * Discovers and loads custom slash commands from .md files in both the
 * user's global config directory and the current project's directory.
 *
 * This loader is responsible for:
 * - Recursively scanning command directories for .md files.
 * - Parsing YAML front matter and Markdown content.
 * - Adapting valid definitions into executable SlashCommand objects.
 * - Handling file system errors and malformed files gracefully.
 * 
 * Markdown Command Format:
 * ```markdown
 * ---
 * description: "Command description"
 * tags: ["tag1", "tag2"]
 * author: "Author Name"
 * ---
 * 
 * This is the command prompt content in natural language.
 * It can contain {{args}} placeholders and other processing directives.
 * ```
 */
export class MarkdownCommandLoader implements ICommandLoader {
  private readonly projectRoot: string;
  private readonly folderTrustEnabled: boolean;
  private readonly folderTrust: boolean;

  constructor(private readonly config: Config | null) {
    this.folderTrustEnabled = !!config?.getFolderTrustFeature();
    this.folderTrust = !!config?.getFolderTrust();
    this.projectRoot = config?.getProjectRoot() || process.cwd();
  }

  /**
   * Loads all Markdown commands from user, project, and extension directories.
   * Returns commands in order: user → project → extensions (alphabetically).
   *
   * Order is important for conflict resolution in CommandService:
   * - User/project commands (without extensionName) use "last wins" strategy
   * - Extension commands (with extensionName) get renamed if conflicts exist
   *
   * @param signal An AbortSignal to cancel the loading process.
   * @returns A promise that resolves to an array of all loaded SlashCommands.
   */
  async loadCommands(signal: AbortSignal): Promise<SlashCommand[]> {
    const allCommands: SlashCommand[] = [];
    const globOptions = {
      nodir: true,
      dot: true,
      signal,
      follow: true,
    };

    // Load commands from each directory
    const commandDirs = this.getCommandDirectories();
    for (const dirInfo of commandDirs) {
      try {
        const files = await glob('**/*.md', {
          ...globOptions,
          cwd: dirInfo.path,
        });

        if (this.folderTrustEnabled && !this.folderTrust) {
          return [];
        }

        const commandPromises = files.map((file) =>
          this.parseAndAdaptFile(
            path.join(dirInfo.path, file),
            dirInfo.path,
            dirInfo.extensionName,
          ),
        );

        const commands = (await Promise.all(commandPromises)).filter(
          (cmd): cmd is SlashCommand => cmd !== null,
        );

        // Add all commands without deduplication
        allCommands.push(...commands);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(
            `[MarkdownCommandLoader] Error loading commands from ${dirInfo.path}:`,
            error,
          );
        }
      }
    }

    return allCommands;
  }

  /**
   * Get all command directories in order for loading.
   * User commands → Project commands → Extension commands
   * This order ensures extension commands can detect all conflicts.
   */
  private getCommandDirectories(): CommandDirectory[] {
    const dirs: CommandDirectory[] = [];

    const storage = this.config?.storage ?? new Storage(this.projectRoot);

    // 1. User commands
    dirs.push({ path: Storage.getUserCommandsDir() });

    // 2. Project commands (override user commands)
    dirs.push({ path: storage.getProjectCommandsDir() });

    // 3. Extension commands (processed last to detect all conflicts)
    if (this.config) {
      const activeExtensions = this.config
        .getExtensions()
        .filter((ext) => ext.isActive)
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically for deterministic loading

      const extensionCommandDirs = activeExtensions.map((ext) => ({
        path: path.join(ext.path, 'commands'),
        extensionName: ext.name,
      }));

      dirs.push(...extensionCommandDirs);
    }

    return dirs;
  }

  /**
   * Parses a single .md file and transforms it into a SlashCommand object.
   * @param filePath The absolute path to the .md file.
   * @param baseDir The root command directory for name calculation.
   * @param extensionName Optional extension name to prefix commands with.
   * @returns A promise resolving to a SlashCommand, or null if the file is invalid.
   */
  private async parseAndAdaptFile(
    filePath: string,
    baseDir: string,
    extensionName?: string,
  ): Promise<SlashCommand | null> {
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      console.error(
        `[MarkdownCommandLoader] Failed to read file ${filePath}:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(fileContent);
    } catch (error: unknown) {
      console.error(
        `[MarkdownCommandLoader] Failed to parse Markdown file ${filePath}:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }

    // Validate the front matter
    const validationResult = MarkdownCommandDefSchema.safeParse(parsed.data);

    if (!validationResult.success) {
      console.error(
        `[MarkdownCommandLoader] Skipping invalid command file: ${filePath}. Validation errors:`,
        validationResult.error.flatten(),
      );
      return null;
    }

    const validDef = validationResult.data;
    const prompt = validDef.prompt;

    if (!prompt) {
      console.error(
        `[MarkdownCommandLoader] Skipping command file with empty prompt: ${filePath}`,
      );
      return null;
    }

    const relativePathWithExt = path.relative(baseDir, filePath);
    const relativePath = relativePathWithExt.substring(
      0,
      relativePathWithExt.length - 3, // length of '.md'
    );
    const baseCommandName = relativePath
      .split(path.sep)
      // Sanitize each path segment to prevent ambiguity. Since ':' is our
      // namespace separator, we replace any literal colons in filenames
      // with underscores to avoid naming conflicts.
      .map((segment) => segment.replaceAll(':', '_'))
      .join(':');

    // Add extension name tag for extension commands
    const defaultDescription = `Custom command from ${path.basename(filePath)}`;
    let description = validDef.description || defaultDescription;
    if (extensionName) {
      description = `[${extensionName}] ${description}`;
    }

    const processors: IPromptProcessor[] = [];
    const usesArgs = prompt.includes(SHORTHAND_ARGS_PLACEHOLDER);
    const usesShellInjection = prompt.includes(SHELL_INJECTION_TRIGGER);
    const usesAtFileInjection = prompt.includes(AT_FILE_INJECTION_TRIGGER);

    // 1. @-File Injection (Security First).
    // This runs first to ensure we're not executing shell commands that
    // could dynamically generate malicious @-paths.
    if (usesAtFileInjection) {
      processors.push(new AtFileProcessor(baseCommandName));
    }

    // 2. Argument and Shell Injection.
    // This runs after file content has been safely injected.
    if (usesShellInjection || usesArgs) {
      processors.push(new ShellProcessor(baseCommandName));
    }

    // 3. Default Argument Handling.
    // Appends the raw invocation if no explicit {{args}} are used.
    if (!usesArgs) {
      processors.push(new DefaultArgumentProcessor());
    }

    return {
      name: baseCommandName,
      description,
      kind: CommandKind.FILE,
      extensionName,
      action: async (
        context: CommandContext,
        _args: string,
      ): Promise<SlashCommandActionReturn> => {
        if (!context.invocation) {
          console.error(
            `[MarkdownCommandLoader] Critical error: Command '${baseCommandName}' was executed without invocation context.`,
          );
          return {
            type: 'submit_prompt',
            content: [{ text: prompt }], // Fallback to unprocessed prompt
          };
        }

        try {
          let processedContent: PromptPipelineContent = [{ text: prompt }];
          for (const processor of processors) {
            processedContent = await processor.process(
              processedContent,
              context,
            );
          }

          return {
            type: 'submit_prompt',
            content: processedContent,
          };
        } catch (e) {
          // Check if it's our specific error type
          if (e instanceof ConfirmationRequiredError) {
            // Halt and request confirmation from the UI layer.
            return {
              type: 'confirm_shell_commands',
              commandsToConfirm: e.commandsToConfirm,
              originalInvocation: {
                raw: context.invocation.raw,
              },
            };
          }
          // Re-throw other errors to be handled by the global error handler.
          throw e;
        }
      },
    };
  }
}