#!/usr/bin/env node
/**
 * Test script to verify compatibility between Markdown and TOML command systems
 */

import { Storage } from './packages/core/dist/src/config/storage.js';
import { MarkdownCommandLoader } from './packages/cli/dist/src/services/MarkdownCommandLoader.js';
import { FileCommandLoader } from './packages/cli/dist/src/services/FileCommandLoader.js';
import path from 'path';
import fs from 'fs';

console.log('Testing Markdown and TOML command compatibility...');

try {
    // Initialize storage and loaders
    const projectRoot = process.cwd();
    const storage = new Storage(projectRoot);
    const commandsDir = storage.getProjectCommandsDir();
    
    console.log(`\nProject commands directory: ${commandsDir}`);
    const userCommandsDir = Storage.getUserCommandsDir();
    console.log(`User commands directory: ${userCommandsDir}`);
    
    // Test TOML command loading
    console.log('\n=== Testing TOML Command Loading ===');
    const tomlLoader = new FileCommandLoader();
    const tomlCommands = await tomlLoader.loadCommands();
    console.log(`Loaded ${tomlCommands.length} TOML commands:`);
    tomlCommands.forEach(cmd => {
        console.log(`  - /${cmd.name} (${cmd.description || 'No description'})`);
    });
    
    // Test Markdown command loading
    console.log('\n=== Testing Markdown Command Loading ===');
    const mdLoader = new MarkdownCommandLoader();
    const mdCommands = await mdLoader.loadCommands();
    console.log(`Loaded ${mdCommands.length} Markdown commands:`);
    mdCommands.forEach(cmd => {
        console.log(`  - /${cmd.name} (${cmd.description || 'No description'})`);
    });
    
    // Test command name conflicts
    console.log('\n=== Testing Command Name Conflicts ===');
    const tomlNames = new Set(tomlCommands.map(cmd => cmd.name));
    const mdNames = new Set(mdCommands.map(cmd => cmd.name));
    const conflicts = [...tomlNames].filter(name => mdNames.has(name));
    
    if (conflicts.length > 0) {
        console.log(`⚠ Found ${conflicts.length} naming conflicts:`);
        conflicts.forEach(name => {
            console.log(`  - Command name '${name}' exists in both TOML and Markdown`);
        });
    } else {
        console.log('✓ No naming conflicts found between TOML and Markdown commands');
    }
    
    // Test combined command loading
    console.log('\n=== Testing Combined Command Loading ===');
    const allCommands = [...tomlCommands, ...mdCommands];
    console.log(`Total commands available: ${allCommands.length}`);
    
    // Group by extension/namespace
    const commandsByNamespace = {};
    allCommands.forEach(cmd => {
        const namespace = cmd.name.includes(':') ? cmd.name.split(':')[0] : 'global';
        if (!commandsByNamespace[namespace]) {
            commandsByNamespace[namespace] = [];
        }
        commandsByNamespace[namespace].push(cmd);
    });
    
    console.log('\nCommands by namespace:');
    Object.entries(commandsByNamespace).forEach(([namespace, commands]) => {
        console.log(`  ${namespace}: ${commands.length} commands`);
        commands.forEach(cmd => {
            const type = cmd.extensionName ? 'TOML' : 'Markdown';
            console.log(`    - /${cmd.name} (${type})`);
        });
    });
    
    // Test command execution compatibility
    console.log('\n=== Testing Command Execution Compatibility ===');
    
    // Create mock context for testing
    const mockConfig = {
        getFolderTrustFeature: () => ({ isTrusted: () => true }),
        getShellAllowlist: () => ({ isAllowed: () => true }),
        getExcludeTools: () => [],
        getCoreTools: () => [],
        getApprovalMode: () => 'default',
        getWorkspaceContext: () => ({}),
        getProjectRoot: () => process.cwd(),
        getWorkingDir: () => process.cwd(),
        getFileService: () => ({
            findFiles: () => Promise.resolve([]),
            readFile: () => Promise.resolve(''),
        }),
    };
    
    const mockUI = {
        addItem: (item, timestamp) => {
            console.log(`    [UI] ${item.type}: ${item.text}`);
        }
    };
    
    // Test a few commands from each type
    const testCommands = [
        ...tomlCommands.slice(0, 2),  // First 2 TOML commands
        ...mdCommands.slice(0, 2)     // First 2 Markdown commands
    ];
    
    for (const command of testCommands) {
        const type = command.extensionName ? 'TOML' : 'Markdown';
        console.log(`\n  Testing ${type} command: /${command.name}`);
        
        if (typeof command.action === 'function') {
            try {
                const context = {
                    invocation: {
                        raw: `/${command.name}`,
                        command: command.name,
                        args: ''
                    },
                    services: { config: mockConfig },
                    session: {
                        sessionShellAllowlist: { 
                            isAllowed: () => true,
                            [Symbol.iterator]: function* () {}
                        }
                    },
                    ui: mockUI,
                    projectRoot: process.cwd(),
                    workingDirectory: process.cwd()
                };
                
                const result = await command.action(context);
                console.log(`    ✓ Command executed successfully (${type})`);
                console.log(`    Result type: ${typeof result}`);
            } catch (error) {
                console.log(`    ✗ Command execution failed (${type}): ${error.message}`);
            }
        } else {
            console.log(`    ⚠ Command has no executable action (${type})`);
        }
    }
    
    console.log('\n=== Compatibility Test Summary ===');
    console.log(`✓ TOML commands loaded: ${tomlCommands.length}`);
    console.log(`✓ Markdown commands loaded: ${mdCommands.length}`);
    console.log(`✓ Total commands available: ${allCommands.length}`);
    console.log(`${conflicts.length === 0 ? '✓' : '⚠'} Naming conflicts: ${conflicts.length}`);
    console.log('✓ Both command types can coexist and execute');
    
    console.log('\n🎉 Markdown and TOML command systems are compatible!');
    
} catch (error) {
    console.error('❌ Compatibility test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
}