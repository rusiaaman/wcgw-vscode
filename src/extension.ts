import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('WCGW extension is now active!');
    let disposable = vscode.commands.registerCommand('wcgw.sendToApp', async () => {
        console.log('WCGW command triggered');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        // Get the selected text
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        if (!selectedText) {
            vscode.window.showErrorMessage('No text selected');
            return;
        }

        // Show input box for helpful text
        const helpfulText = await vscode.window.showInputBox({
            prompt: "Instructions or helpful text to include with the code snippet",
            placeHolder: "E.g.: This function handles user authentication..."
        });

        if (helpfulText === undefined) {
            // User cancelled the input
            return;
        }

        // Get file and workspace paths
        const filePath = editor.document.uri.fsPath;
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

        // Create template text with the helpful text
        const templateText = `${helpfulText}
        
---
Selected Code:
\`\`\`
${selectedText}
\`\`\`

File: ${filePath}
Workspace: ${workspacePath}`;

        // Copy to clipboard and ensure it's complete
        console.log('Writing to clipboard...');
        await vscode.env.clipboard.writeText(templateText);
        
        // Give the system a moment to ensure clipboard is updated
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('Clipboard write complete');

        // Get target app from configuration
        const config = vscode.workspace.getConfiguration('wcgw');
        const targetApp = config.get<string>('targetApplication', 'Notes');

        // Activate the target application (macOS only)
        if (process.platform === 'darwin') {
            console.log(`Activating ${targetApp}...`);
            exec(`osascript -e 'tell application "${targetApp}" to activate'`, (error) => {
                if (error) {
                    vscode.window.showErrorMessage(`Failed to activate ${targetApp}: ${error.message}`);
                    return;
                }
                
                // Add a delay before pasting to ensure app switch is complete
                setTimeout(() => {
                    console.log('Attempting to paste...');
                    exec(`osascript -e '
                        tell application "System Events"
                            delay 0.1
                            keystroke "v" using {command down}
                        end tell'`, (pasteError, stdout, stderr) => {
                            if (pasteError) {
                                console.log('Paste error:', pasteError);
                                vscode.window.showErrorMessage(`Paste failed: ${pasteError.message}`);
                            } else {
                                console.log('Paste command completed');
                            }
                        });
                }, 500);
            });
        } else {
            vscode.window.showErrorMessage('This feature is currently only supported on macOS');
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}