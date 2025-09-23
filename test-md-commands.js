#!/usr/bin/env node

// Test script to verify Markdown command loading functionality
import { MarkdownCommandLoader } from './packages/cli/dist/src/services/MarkdownCommandLoader.js';
import { Storage } from '@google/gemini-cli-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMarkdownCommands() {
  console.log('Testing Markdown command loading...');
  
  // Create the loader with null config (will use defaults)
  const loader = new MarkdownCommandLoader(null);
  
  try {
    // Debug: Check what directories are being searched
    console.log('\nChecking command directories:');
    console.log('- User commands dir:', path.join(process.env.APPDATA || process.env.HOME || '', 'gemini-cli', 'commands'));
    console.log('- Project commands dir:', path.join(process.cwd(), '.gemini', 'commands'));
    
    // Check if directories exist
    const projectCommandsDir = path.join(process.cwd(), '.gemini', 'commands');
    try {
      const fs = await import('fs/promises');
      await fs.access(projectCommandsDir);
      console.log('✓ Project commands directory exists');
      const files = await fs.readdir(projectCommandsDir);
      console.log('  Files found:', files);
    } catch (error) {
      console.log('✗ Project commands directory does not exist or is not accessible');
    }
    
    // Load commands (provide AbortSignal)
    const abortController = new AbortController();
    const commands = await loader.loadCommands(abortController.signal);
    
    console.log(`\nLoaded ${commands.length} Markdown commands:`);
    commands.forEach(cmd => {
      console.log(`- /${cmd.name} (${cmd.namespace || 'default'}) - ${cmd.description}`);
    });
    
    // Test a specific command if available
    const testCommand = commands.find(cmd => cmd.name === 'test-coverage');
    if (testCommand) {
      console.log('\nTesting test-coverage command:');
      console.log('Name:', testCommand.name);
      console.log('Description:', testCommand.description);
      console.log('Extension:', testCommand.extensionName || 'default');
      console.log('Kind:', testCommand.kind);
      console.log('Action type:', typeof testCommand.action);
    }
    
  } catch (error) {
    console.error('Error loading commands:', error);
  }
}

testMarkdownCommands().catch(console.error);