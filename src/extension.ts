import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import ignore from 'ignore';

interface SelectionContent {
    text: string;
    path?: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('WCGW extension is now active!');

    // Register editor command
    let editorCommand = vscode.commands.registerCommand('wcgw.sendEditorToApp', async () => {
        console.log('WCGW editor command triggered');

        try {
            const editorContent = await getEditorSelection();

            const helpfulText = await vscode.window.showInputBox({
                prompt: "Instructions or helpful text to include with the code snippet",
                placeHolder: "E.g.: This function handles user authentication..."
            });

            if (helpfulText === undefined) {
                return; // User cancelled
            }

            const formattedContent = formatEditorContent(
                helpfulText,
                editorContent,
                getWorkspacePath()
            );

            await copyToTargetApp(formattedContent);

        } catch (error: unknown) {
            console.error('Error in sendEditorToApp:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Operation failed: ${errorMessage}`);
        }
    });

    // Register terminal command
    let terminalCommand = vscode.commands.registerCommand('wcgw.sendTerminalToApp', async () => {
        console.log('WCGW terminal command triggered');

        try {
            const terminalContent = await getTerminalSelection();

            const helpfulText = await vscode.window.showInputBox({
                prompt: "Instructions or helpful text to include with the terminal output",
                placeHolder: "E.g.: This is the output of the build process..."
            });

            if (helpfulText === undefined) {
                return; // User cancelled
            }

            const formattedContent = formatTerminalContent(
                helpfulText,
                terminalContent,
                getWorkspacePath()
            );

            await copyToTargetApp(formattedContent);

        } catch (error: unknown) {
            console.error('Error in sendTerminalToApp:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Operation failed: ${errorMessage}`);
        }
    });

    const fullContextCommand = vscode.commands.registerCommand('wcgw.copyWithFullContext', async () => {
        console.log('WCGW full context command triggered');

        try {
            const editorContent = await getEditorSelection();

            const helpfulText = await vscode.window.showInputBox({
                prompt: "Instructions or helpful text to include with the full context",
                placeHolder: "E.g.: This contains the full repo structure and relevant files..."
            });

            if (helpfulText === undefined) {
                return; // User cancelled
            }
            
            const workspaceStructure = await getWorkspaceStructure();
            const relevantFiles = await getRelevantFiles();

            const contextContent = formatFullContextContent(
                editorContent,
                workspaceStructure,
                relevantFiles,
                false
            );

            await copyToTargetApp({
                firstLine: helpfulText,
                restOfText: contextContent
            });

        } catch (error: unknown) {
            console.error('Error in copyWithFullContext:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Operation failed: ${errorMessage}`);
        }
    });

    const fullContextTerminalCommand = vscode.commands.registerCommand('wcgw.copyWithFullContextTerminal', async () => {
        console.log('WCGW full context terminal command triggered');

        try {
            const terminalContent = await getTerminalSelection();

            const helpfulText = await vscode.window.showInputBox({
                prompt: "Instructions or helpful text to include with the full context",
                placeHolder: "E.g.: This contains the terminal output with full repo structure..."
            });

            if (helpfulText === undefined) {
                return; // User cancelled
            }
            
            const workspaceStructure = await getWorkspaceStructure();
            const relevantFiles = await getRelevantFiles();

            const contextContent = formatFullContextContent(
                terminalContent,
                workspaceStructure,
                relevantFiles,
                true
            );

            await copyToTargetApp({
                firstLine: helpfulText,
                restOfText: contextContent
            });

        } catch (error: unknown) {
            console.error('Error in copyWithFullContextTerminal:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Operation failed: ${errorMessage}`);
        }
    });

    context.subscriptions.push(editorCommand, terminalCommand, fullContextCommand, fullContextTerminalCommand);

    async function getWorkspaceStructure(): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            return '';
        }

        // Load and parse .gitignore
        const gitignorePath = path.join(workspaceFolder, '.gitignore');
        let ig = ignore();
        if (fs.existsSync(gitignorePath)) {
            const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
            ig = ignore().add(gitignoreContent);
        }

        // Get all files
        const allFiles = await getAllFiles(workspaceFolder);

        // Filter files using .gitignore
        const filteredFiles = allFiles.filter((file) => {
            const relativePath = path.relative(workspaceFolder, file);
            return !ig.ignores(relativePath) && !relativePath.startsWith('.git');
        });

        // Group files by directory
        const filesByDirectory = new Map<string, string[]>();
        const MAX_FILES_PER_DIR = 30;
        const MAX_TOTAL_FILES = 300;
        let totalFiles = 0;

        filteredFiles.forEach((file) => {
            const dir = path.dirname(file);
            if (!filesByDirectory.has(dir)) {
                filesByDirectory.set(dir, []);
            }
            filesByDirectory.get(dir)?.push(file);
        });

        // Build the output string with truncation markers
        const outputParts: string[] = [];
        
        for (const [dir, files] of filesByDirectory) {
            if (totalFiles >= MAX_TOTAL_FILES) {
                outputParts.push('... (more directories truncated)');
                break;
            }

            if (files.length > MAX_FILES_PER_DIR) {
                const truncatedFiles = files.slice(0, MAX_FILES_PER_DIR);
                truncatedFiles.forEach((file) => {
                    if (totalFiles < MAX_TOTAL_FILES) {
                        outputParts.push(file);
                        totalFiles++;
                    }
                });
                outputParts.push(`... (${files.length - MAX_FILES_PER_DIR} more files in ${dir})`);
            } else {
                files.forEach((file) => {
                    if (totalFiles < MAX_TOTAL_FILES) {
                        outputParts.push(file);
                        totalFiles++;
                    }
                });
            }
        }

        return outputParts.join('\n');
    }

    async function getAllFiles(dir: string): Promise<string[]> {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = await Promise.all(
            entries.flatMap(async (entry: fs.Dirent) => {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    return await getAllFiles(fullPath); // Recursively resolve directory contents
                }
                return fullPath; // Return the file path as a string
            })
        );
        return files.flat(); // Flatten the array after all promises resolve
}

    async function getRelevantFiles(): Promise<string> {
        const files = [
            // Core project files
            'README.md',             // Project overview and documentation
            'README.txt',            // Alternative README format
            'README',                // No extension README
            'package.json',          // Node.js/JavaScript project manifest
            'pyproject.toml',        // Python project configuration
            'Cargo.toml',            // Rust project manifest
            'go.mod',                // Go project manifest
            'pom.xml',               // Java Maven project
            'build.gradle',          // Java/Kotlin Gradle project
            'composer.json',         // PHP project manifest
            'Gemfile',               // Ruby project dependencies
            'mix.exs',               // Elixir project configuration
            'Package.swift',         // Swift package manifest
            'pubspec.yaml',          // Dart/Flutter project manifest
            'CMakeLists.txt',        // C/C++ project configuration
            'Makefile',              // Generic build configuration
            'setup.py',              // Python setup configuration (legacy)
            'index.html'             // Web project entrypoint
        ]; 
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) return '';

        const fileContents: string[] = [];

        for (const file of files) {
            const uri = vscode.Uri.joinPath(workspaceRoot, file);
            try {
                const content = await vscode.workspace.fs.readFile(uri);
                fileContents.push(`// ${uri.fsPath}\n\`\`\`\n${content.toString()}\n\`\`\`\n`);
            } catch {
                // Skip files that don't exist or can't be read
                continue;
            }
        }

        return fileContents.join('\n');
    }

   function formatFullContextContent(
        content: SelectionContent & { fullText?: string },
        workspaceStructure: string,
        relevantFiles: string,
        isTerminal: boolean = false
    ): string {
        const blocks: string[] = [];
        
        blocks.push('\n---');
        
        // Only include the selected content block if there is content
        if (content.text.trim()) {
            blocks.push(isTerminal ? 'Terminal selection:' : 'Selected code:');
            blocks.push('');
            blocks.push('```');
            blocks.push(content.text);
            blocks.push('```');
            blocks.push('');
            blocks.push('---');
        }

        // // Include full file content in full context mode if available and different from selection
        // if (!isTerminal && content.fullText && content.text !== content.fullText) {
        //     blocks.push('Full file content:');
        //     blocks.push('```');
        //     blocks.push(content.fullText);
        //     blocks.push('```');
        //     blocks.push('---');
        // }
        
        // Add workspace path and file path
        const workspacePath = getWorkspacePath();
        blocks.push(`Workspace path: ${workspacePath}`);
        if (content.path) {
            blocks.push(`File path: ${content.path}`);
        }
        blocks.push('---');
        
        blocks.push('Workspace structure:');
        blocks.push(workspaceStructure);
        blocks.push('---');
        blocks.push('Frequently asked for files:');
        blocks.push(relevantFiles); // Already formatted with file paths and content
        
        return blocks.join('\n');
    }


    async function execCommand(cmd: string, cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(cmd, { cwd }, (error, stdout) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }
}

async function getEditorSelection(): Promise<SelectionContent & { fullText?: string }> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return { text: '' };
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection).trim();
    const fullText = editor.document.getText().trim();
    
    return {
        text: selectedText,
        path: editor.document.uri.fsPath,
        fullText: selectedText !== fullText ? fullText : undefined // Only include if different from selection
    };
}

async function getTerminalSelection(): Promise<SelectionContent> {
    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
        return { text: '' };
    }

    try {
        // Force focus on terminal first
        terminal.show(false); // false means don't take focus
        await sleep(100);

        // Save current clipboard
        const originalClipboard = await vscode.env.clipboard.readText();
        let terminalText = '';

        // Try to get existing selection
        await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
        await sleep(100);
        terminalText = await vscode.env.clipboard.readText();

        // Don't try to get full content if we have a selection
        if (terminalText && terminalText.trim() && terminalText.trim() !== originalClipboard.trim()) {
            // Restore original clipboard
            await vscode.env.clipboard.writeText(originalClipboard);
            return {
                text: terminalText.trim(),
                path: 'Terminal'
            };
        }

        // If we're here, there was no selection, so restore clipboard
        await vscode.env.clipboard.writeText(originalClipboard);
        return { text: '' };
    } catch (error) {
        console.error('Failed to get terminal content:', error);
        throw new Error('Failed to get terminal content');
    }
}

function formatEditorContent(
    helpfulText: string,
    editorContent: SelectionContent & { fullText?: string },
    workspacePath: string
): { firstLine: string; restOfText: string } {
    const helpfulLines = helpfulText.split('\n');
    const firstLine = helpfulLines[0].trim();
    const otherHelpfulLines = helpfulLines.slice(1);

    let contentBlocks: string[] = [];

    // Add additional helpful text if it exists
    if (otherHelpfulLines.length > 0) {
        contentBlocks.push(otherHelpfulLines.join('\n'));
    }
   
    contentBlocks.push('\n---');
    
   // Add separator and file content
    if (editorContent.text.trim()) {
        contentBlocks.push('Selected code:');
        contentBlocks.push('');
        contentBlocks.push('```');
        contentBlocks.push(editorContent.text);
        contentBlocks.push('```');
        blocks.push('');
        contentBlocks.push('---');
    }

    // // Add full file content if available and different from selection
    // if (editorContent.fullText && editorContent.text !== editorContent.fullText) {
    //     contentBlocks.push('Full file content:');
    //     contentBlocks.push('```');
    //     contentBlocks.push(editorContent.fullText);
    //     contentBlocks.push('```');
    //     contentBlocks.push('---');
    // }

    // Add separator and workspace info
    contentBlocks.push(`Workspace path: ${workspacePath}`);
    if (editorContent.path) {
      contentBlocks.push(`File path: ${editorContent.path}`);
    }


    return {
        firstLine,
        restOfText: contentBlocks.join('\n')
    };
}

function formatTerminalContent(
    helpfulText: string,
    terminalContent: SelectionContent,
    workspacePath: string
): { firstLine: string; restOfText: string } {
    const helpfulLines = helpfulText.split('\n');
    const firstLine = helpfulLines[0].trim();
    const otherHelpfulLines = helpfulLines.slice(1);

    let contentBlocks: string[] = [];

    // Add additional helpful text if it exists
    if (otherHelpfulLines.length > 0) {
        contentBlocks.push(otherHelpfulLines.join('\n'));
    }
    contentBlocks.push('\n---');
    // Add separator and file content
    if (terminalContent.text.trim()) {
        contentBlocks.push('Terminal selection:');
        contentBlocks.push('');
        contentBlocks.push('```');
        contentBlocks.push(terminalContent.text);
        contentBlocks.push('```');
        contentBlocks.push('');
        contentBlocks.push('---');
    }

    // Add separator and workspace info
    contentBlocks.push(`Workspace path: ${workspacePath}`);

    return {
        firstLine,
        restOfText: contentBlocks.join('\n')
    };
}

function getWorkspacePath(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
}

async function copyToTargetApp({ firstLine, restOfText }: { firstLine: string; restOfText: string }) {
    console.log('Writing to clipboard...');
    await vscode.env.clipboard.writeText(firstLine + "\n" + restOfText);
    await sleep(100);
    console.log('Clipboard write complete');

    const config = vscode.workspace.getConfiguration('wcgw');
    const targetApp = config.get<string>('targetApplication', 'Notes');

    if (process.platform !== 'darwin') {
        throw new Error('This feature is currently only supported on macOS');
    }

    console.log(`Activating ${targetApp}...`);
    return new Promise<void>((resolve, reject) => {
        exec(`osascript -e '
            tell application "${targetApp}" to activate
            delay 0.2
            tell application "System Events"
                keystroke "k" using {command down}
                delay 2
                keystroke ">"
                delay 0.1
                keystroke "v" using {command down}
            end tell'`, 
        (error) => {
            if (error) {
                console.log('AppleScript error:', error);
                reject(new Error(`Failed to paste in ${targetApp}: ${error.message}`));
            } else {
                console.log('Text entry completed successfully');
                resolve();
            }
        });
    });
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function deactivate() {}