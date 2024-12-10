import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

interface SelectionContent {
    text: string;
    path?: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('WCGW extension is now active!');
    let disposable = vscode.commands.registerCommand('wcgw.sendToApp', async () => {
        console.log('WCGW command triggered');
        
        try {
            const { editorContent, terminalContent } = await getSelections();
            if (!editorContent.text && !terminalContent.text) {
                vscode.window.showErrorMessage('No selection found in editor or terminal');
                return;
            }

            const helpfulText = await vscode.window.showInputBox({
                prompt: "Instructions or helpful text to include with the code snippet",
                placeHolder: "E.g.: This function handles user authentication..."
            });

            if (helpfulText === undefined) {
                return; // User cancelled
            }

            const formattedContent = formatContent(
                helpfulText,
                editorContent,
                terminalContent,
                getWorkspacePath()
            );

            await copyToTargetApp(formattedContent);

        } catch (error: unknown) {
            console.error('Error in sendToApp:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Operation failed: ${errorMessage}`);
        }
    });

    context.subscriptions.push(disposable);
}

async function getSelections(): Promise<{ 
    editorContent: SelectionContent; 
    terminalContent: SelectionContent; 
}> {
    const editorContent = await getEditorSelection();
    const terminalContent = await getTerminalSelection();
    
    return { editorContent, terminalContent };
}

async function getEditorSelection(): Promise<SelectionContent> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return { text: '' };
    }

    const selection = editor.selection;
    return {
        text: editor.document.getText(selection).trim(),
        path: editor.document.uri.fsPath
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

function formatContent(
    helpfulText: string,
    editorContent: SelectionContent,
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

    // Add separator
    contentBlocks.push('\n---');

    // Always add workspace path at the start if any content exists
    if (editorContent.text || terminalContent.text) {
        contentBlocks.push(`Workspace path: ${workspacePath}`);
        contentBlocks.push('---');
    }

    // Handle different combinations of content
    if (editorContent.text && !terminalContent.text) {
        // Only editor content
        contentBlocks.push(`File path: ${editorContent.path}`);
        contentBlocks.push('---');
        contentBlocks.push('Editor selection:');
        contentBlocks.push('```');
        contentBlocks.push(editorContent.text);
        contentBlocks.push('```');
    } else if (!editorContent.text && terminalContent.text) {
        // Only terminal content
        contentBlocks.push('Terminal selection:');
        contentBlocks.push('```');
        contentBlocks.push(terminalContent.text);
        contentBlocks.push('```');
    } else if (editorContent.text && terminalContent.text) {
        // Both editor and terminal content
        contentBlocks.push(`File path: ${editorContent.path}`);
        contentBlocks.push('---');
        contentBlocks.push('Editor selection:');
        contentBlocks.push('```');
        contentBlocks.push(editorContent.text);
        contentBlocks.push('```');
        contentBlocks.push('---');
        contentBlocks.push('Terminal selection:');
        contentBlocks.push('```');
        contentBlocks.push(terminalContent.text);
        contentBlocks.push('```');
    }

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
    await vscode.env.clipboard.writeText(restOfText);
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
                ${firstLine.split('').map(char => 
                    `keystroke "${char.replace(/["']/g, '\\"')}"`
                ).join('\n')}
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