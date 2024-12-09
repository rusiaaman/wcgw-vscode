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
        const hasSelection = selectedText.trim().length > 0;

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

        // Split helpful text into first line and rest, or use default
        const helpfulLines = helpfulText ? helpfulText.split('\n') : ["Here's the code context to analyze."];
        const firstLine = helpfulLines[0].trim();
        const otherHelpfulLines = helpfulLines.slice(1);

        // Construct the text that will be pasted
        const restOfText = [
            ...(otherHelpfulLines.length > 0 ? otherHelpfulLines : []),
            ...(hasSelection ? [
                "\n",
                "---",
                "Selected Code:",
                "```",
                selectedText,
                "```",
            ] : []),
            "",
            `File: ${filePath}`,
            `Workspace: ${workspacePath}`
        ].join('\n');

        // Copy to clipboard and ensure it's complete
        console.log('Writing to clipboard...');
        await vscode.env.clipboard.writeText(restOfText);
        
        // Give the system a moment to ensure clipboard is updated
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('Clipboard write complete');

        // Get target app from configuration
        const config = vscode.workspace.getConfiguration('wcgw');
        const targetApp = config.get<string>('targetApplication', 'Notes');

        // Activate the target application and type first line (macOS only)
        if (process.platform === 'darwin') {
            console.log(`Activating ${targetApp}...`);
            exec(`osascript -e '
                tell application "${targetApp}" to activate
                delay 0.2
                tell application "System Events"
                    -- Type the first line character by character
                    ${firstLine.split('').map(char => `keystroke "${char.replace(/["']/g, '\\"')}"`).join('\n')}
                    delay 0.1
                    -- Paste the rest
                    keystroke "v" using {command down}
                end tell'`, (error) => {
                if (error) {
                    console.log('AppleScript error:', error);
                    vscode.window.showErrorMessage(`Failed to paste in ${targetApp}: ${error.message}`);
                } else {
                    console.log('Text entry completed successfully');
                }
            });
        } else {
            vscode.window.showErrorMessage('This feature is currently only supported on macOS');
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}