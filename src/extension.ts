import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as ignore from 'ignore';
import * as crypto from 'crypto';

interface SelectionContent {
    text: string;
    path?: string;
}

interface ScreenSession {
    pid: string;
    fullName: string;
    hash: string;
    basename: string;
    status: string;
}

let screenPollingInterval: NodeJS.Timer | undefined;
const attachedScreens = new Set<string>();

export function activate(context: vscode.ExtensionContext) {
    console.log('WCGW extension is now active!');

    // Start screen polling
    startScreenPolling();

    // Listen for terminal close events to clean up our tracking
    vscode.window.onDidCloseTerminal((terminal: vscode.Terminal) => {
        // console.log(`WCGW: Terminal closed: "${terminal.name}"`);
        if (terminal.name.includes('WCGW Screen')) {
            // Extract PID from terminal name and remove from tracking
            const pidMatch = terminal.name.match(/\((\d+)\) WCGW Screen:/);
            // console.log(`WCGW: PID match result: ${pidMatch ? pidMatch[1] : 'no match'}`);
            if (pidMatch) {
                const pid = pidMatch[1];
                // console.log(`WCGW: Looking for sessions starting with "${pid}." in attachedScreens`);
                // console.log(`WCGW: Current attachedScreens: [${Array.from(attachedScreens).join(', ')}]`);
                // Find and remove the corresponding session from attachedScreens
                for (const sessionName of attachedScreens) {
                    if (sessionName.startsWith(pid + '.')) {
                        attachedScreens.delete(sessionName);
                        console.log(`WCGW: Removed closed terminal session from tracking: ${sessionName}`);
                        break;
                    }
                }
                // console.log(`WCGW: attachedScreens after cleanup: [${Array.from(attachedScreens).join(', ')}]`);
            }
        }
    });

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

    // Register screen attachment command
    let screenCommand = vscode.commands.registerCommand('wcgw.checkScreenSessions', async () => {
        console.log('WCGW check screen sessions command triggered');
        try {
            await checkAndAttachScreenSessions();
            vscode.window.showInformationMessage('Checked for WCGW screen sessions');
        } catch (error: unknown) {
            console.error('Error in checkScreenSessions:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to check screen sessions: ${errorMessage}`);
        }
    });

    // Register toggle screen polling command
    let togglePollingCommand = vscode.commands.registerCommand('wcgw.toggleScreenPolling', async () => {
        const config = vscode.workspace.getConfiguration('wcgw');
        const currentState = config.get<boolean>('screenPollingEnabled', true);
        
        await config.update('screenPollingEnabled', !currentState, vscode.ConfigurationTarget.Global);
        
        if (!currentState) {
            startScreenPolling();
            vscode.window.showInformationMessage('WCGW screen polling enabled');
        } else {
            if (screenPollingInterval) {
                clearInterval(screenPollingInterval);
                screenPollingInterval = undefined;
            }
            vscode.window.showInformationMessage('WCGW screen polling disabled');
        }
    });

    context.subscriptions.push(editorCommand, terminalCommand, fullContextCommand, fullContextTerminalCommand, screenCommand, togglePollingCommand);

    // Clean up polling on deactivation
    context.subscriptions.push({
        dispose: () => {
            if (screenPollingInterval) {
                clearInterval(screenPollingInterval);
            }
        }
    });

    async function getWorkspaceStructure(): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            return '';
        }

        // Load and parse .gitignore
        const gitignorePath = path.join(workspaceFolder, '.gitignore');
        let ig = ignore.default();
        if (fs.existsSync(gitignorePath)) {
            const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
            ig = ignore.default().add(gitignoreContent);
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
            blocks.push('\n');
            blocks.push('```');
            blocks.push(content.text);
            blocks.push('```');
            blocks.push('\n');
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
        contentBlocks.push('\n');
        contentBlocks.push('```');
        contentBlocks.push(editorContent.text);
        contentBlocks.push('```');
        contentBlocks.push('\n');
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
        contentBlocks.push('\n');
        contentBlocks.push('```');
        contentBlocks.push(terminalContent.text);
        contentBlocks.push('```');
        contentBlocks.push('\n');
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
    console.log('Saving original clipboard content...');
    const originalClipboard = await vscode.env.clipboard.readText();
    
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
            delay 2
            tell application "System Events"
                keystroke "k" using {command down}
                delay 0.5
                keystroke space
                delay 0.1
                key code 51 using {command down}
                delay 0.1
                keystroke "v" using {command down}
                delay 0.1
            end tell'`, 
        async (error: Error | null) => {
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

function startScreenPolling() {
    const config = vscode.workspace.getConfiguration('wcgw');
    const pollingEnabled = config.get<boolean>('screenPollingEnabled', true);
    const pollingInterval = config.get<number>('screenPollingInterval', 1000);

    if (!pollingEnabled) {
        console.log('Screen polling is disabled');
        return;
    }

    // Poll for new screen sessions
    screenPollingInterval = setInterval(async () => {
        try {
            await checkAndAttachScreenSessions();
        } catch (error) {
            console.error('Error in screen polling:', error);
        }
    }, pollingInterval);

    // Also check immediately
    checkAndAttachScreenSessions().catch(error => {
        console.error('Error in initial screen check:', error);
    });

    console.log(`Started screen polling with interval: ${pollingInterval}ms`);
}

async function checkAndAttachScreenSessions() {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        return;
    }

    const screenSessions = await getScreenSessions();
    
    const matchingSessions = getMatchingScreenSessions(screenSessions, workspacePath);

    for (const session of matchingSessions) {
        const inAttachedSet = attachedScreens.has(session.fullName);
        const alreadyAttached = isScreenAlreadyAttached(session.fullName);
        
        
        if (!inAttachedSet && !alreadyAttached) {
            await attachToScreenSession(session);
            attachedScreens.add(session.fullName);
        }
    }
    
    // console.log(`WCGW: Current attachedScreens set contains: [${Array.from(attachedScreens).join(', ')}]`);
}

async function getScreenSessions(): Promise<ScreenSession[]> {
    return new Promise((resolve, _reject) => {
        exec('screen -ls', (error: Error | null, stdout: string, _stderr: string) => {
            // screen -ls returns exit code 1 when there are detached sessions, so don't treat as error
            if (error && !stdout.includes('Socket') && !stdout.includes('screen')) {
                resolve([]);
                return;
            }

            const sessions: ScreenSession[] = [];
            const lines = stdout.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                // Match pattern like: 555.wcgw.24-15h06m22s.be7.claude_playground (Attached)
                // More flexible regex to handle various formats
                const match = trimmed.match(/^(\d+)\.wcgw\.[\d-hHmMsS]+\.([a-f0-9]{3})\.([^(]+?)\s*\(([^)]+)\)/);
                
                if (match) {
                    const [, pid, hash, basename, status] = match;
                    const fullName = trimmed.split(/\s+/)[0]; // Get the full session name before status
                    
                    sessions.push({
                        pid,
                        fullName,
                        hash,
                        basename: basename.trim(),
                        status: status.trim()
                    });
                    
                }
            }

            resolve(sessions);
        });
    });
}

function getMatchingScreenSessions(sessions: ScreenSession[], workspacePath: string): ScreenSession[] {
    const normalizedWorkspacePath = path.normalize(path.resolve(workspacePath));
    const workspaceBasename = path.basename(normalizedWorkspacePath);
    const workspaceHash = crypto.createHash('md5')
        .update(normalizedWorkspacePath)
        .digest('hex')
        .substring(0, 3);

    // console.log(`WCGW: Matching criteria - basename: "${workspaceBasename}", hash: "${workspaceHash}"`);
    // console.log(`WCGW: Normalized workspace path: "${normalizedWorkspacePath}"`);

    const matchingSessions = sessions.filter(session => {
        const hashMatch = session.hash === workspaceHash;
        const basenameMatch = session.basename === workspaceBasename;
        // console.log(`WCGW: Session ${session.fullName} - hash match: ${hashMatch} (${session.hash} vs ${workspaceHash}), basename match: ${basenameMatch} (${session.basename} vs ${workspaceBasename})`);
        return hashMatch && basenameMatch;
    });

    // console.log(`WCGW: Found ${matchingSessions.length} matching sessions out of ${sessions.length} total`);
    return matchingSessions;
}

function isScreenAlreadyAttached(sessionName: string): boolean {
    // Extract PID from session name (e.g., "555.wcgw..." -> "555")
    const pid = sessionName.split('.')[0];
    // console.log(`WCGW: Checking if session ${sessionName} (PID: ${pid}) is already attached`);
    
    // Check if we already have a terminal with this screen session's PID
    const terminals = vscode.window.terminals;
    // console.log(`WCGW: Current terminals: [${terminals.map(t => t.name).join(', ')}]`);
    
    const isAttached = terminals.some((terminal: vscode.Terminal) => {
        const hasWCGWScreen = terminal.name.includes('WCGW Screen');
        const hasPID = terminal.name.includes(`(${pid})`);
        // console.log(`WCGW: Terminal "${terminal.name}" - hasWCGWScreen: ${hasWCGWScreen}, hasPID: ${hasPID}`);
        return hasWCGWScreen && hasPID;
    });
    
    // console.log(`WCGW: Session ${sessionName} already attached: ${isAttached}`);
    return isAttached;
}

async function attachToScreenSession(session: ScreenSession) {
    try {
        // Put PID first, then WCGW Screen, then basename
        const terminalName = `(${session.pid}) WCGW Screen: ${session.basename}`;
        // console.log(`WCGW: Creating terminal with name: "${terminalName}"`);
        // console.log(`WCGW: Screen command: screen -x ${session.fullName}`);
        
        const terminal = vscode.window.createTerminal({
            name: terminalName,
            iconPath: new vscode.ThemeIcon('device-desktop'), // Screen/desktop icon
            shellPath: '/usr/bin/screen',
            shellArgs: ['-x', session.fullName]
        });

        terminal.show(false); // Show but don't focus
        
        // console.log(`WCGW: Successfully attached to screen session: ${session.fullName}`);
        vscode.window.showInformationMessage(`Attached to WCGW screen session: (${session.pid}) ${session.basename}`);
        
    } catch (error) {
        console.error(`WCGW: Failed to attach to screen session ${session.fullName}:`, error);
        vscode.window.showErrorMessage(`Failed to attach to screen session: ${session.basename}`);
    }
}

export function deactivate() {
    if (screenPollingInterval) {
        clearInterval(screenPollingInterval);
    }
}