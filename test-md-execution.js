import { MarkdownCommandLoader } from './packages/cli/dist/src/services/MarkdownCommandLoader.js';
import { Storage } from './packages/core/dist/src/config/storage.js';
import path from 'path';
import fs from 'fs';

console.log('Testing Markdown command execution...');

// Create storage and loader
const storage = new Storage(null);
const loader = new MarkdownCommandLoader(null, storage);

// Load commands
const commands = await loader.loadCommands(new AbortController().signal);
console.log(`\nLoaded ${commands.length} commands`);

// Test different command types
for (const command of commands) {
    console.log(`\n=== Testing ${command.name} ===`);
    
    try {
        // Get the action function
        const action = command.action;
        
        if (typeof action === 'function') {
            console.log('✓ Command has executable action');
            
            // Test with sample arguments based on command type
            let testArgs = '';
            
            switch (command.name) {
                case 'explain-code':
                    testArgs = 'function add(a, b) { return a + b; }';
                    break;
                case 'review-file':
                    // Create a test file for file injection
                    const testFilePath = './test-sample.js';
                    fs.writeFileSync(testFilePath, 'const x = 1;\nconsole.log(x);');
                    testArgs = testFilePath;
                    break;
                case 'git:commit-message':
                    testArgs = ''; // No args needed, uses shell command
                    break;
                case 'test-coverage':
                    testArgs = './src';
                    break;
            }
            
            console.log(`Testing with args: "${testArgs}"`);
            
            // Create proper command context with services
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
                // Add other config methods as needed
            };
            
            const mockUI = {
                addItem: (item, timestamp) => {
                    console.log(`[UI] ${item.type}: ${item.text}`);
                }
            };
            
            const context = {
                invocation: {
                    raw: `/${command.name} ${testArgs}`,
                    command: command.name,
                    args: testArgs
                },
                services: {
                    config: mockConfig
                },
                session: {
                    sessionShellAllowlist: { 
                        isAllowed: () => true,
                        [Symbol.iterator]: function* () {
                            // Empty iterator for testing
                        }
                    }
                },
                ui: mockUI,
                projectRoot: process.cwd(),
                workingDirectory: process.cwd()
            };
            
            // Execute the command with proper context
            const result = await action(context, testArgs);
            
            if (result && typeof result === 'object') {
                console.log('✓ Command executed successfully');
                console.log('Result type:', typeof result);
                
                // Check if it has the expected structure
                if (result.prompt) {
                    console.log('✓ Generated prompt found');
                    console.log('Prompt preview:', result.prompt.substring(0, 100) + '...');
                } else {
                    console.log('⚠ No prompt in result');
                }
            } else {
                console.log('⚠ Unexpected result type:', typeof result);
            }
            
        } else {
            console.log('⚠ Command action is not a function:', typeof action);
        }
        
    } catch (error) {
        console.log('✗ Error testing command:', error.message);
    }
}

// Clean up test file
if (fs.existsSync('./test-sample.js')) {
    fs.unlinkSync('./test-sample.js');
}

console.log('\n=== Markdown Command Execution Test Complete ===');