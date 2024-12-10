import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('WCGW extension is now active!');
    let disposable = vscode.commands.registerCommand('wcgw.sendToApp', async () => {
        console.log('WCGW command triggered');
        // Check active focused terminal or editor
        let selectedText = '';
        let hasSelection = false;
        let filePath = '';
        
        const editor = vscode.window.activeTextEditor;
        const terminal = vscode.window.activeTerminal;
        const inTerminal = terminal && !editor;
        
        if (terminal) {
            try {
                // For terminal, we need to:
                // 1. Store current clipboard
                // 2. Copy selection (if any)
                // 3. Get clipboard content
                // 4. Restore original clipboard
                const previousClipboard = await vscode.env.clipboard.readText();
                
                // Try to get selection first
                await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
                await new Promise(resolve => setTimeout(resolve, 200)); // Give more time for clipboard
                selectedText = await vscode.env.clipboard.readText();
                
                // If no selection, try to get current line/view
                if (!selectedText.trim()) {
                    await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
                    await new Promise(resolve => setTimeout(resolve, 100));
                    await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
                    await new Promise(resolve => setTimeout(resolve, 200));
                    selectedText = await vscode.env.clipboard.readText();
                    // Clear selection
                    await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');
                }
                
                // Restore original clipboard
                await vscode.env.clipboard.writeText(previousClipboard);
                hasSelection = selectedText.trim().length > 0;
                filePath = 'Terminal';
            } catch (error) {
                console.error('Failed to get terminal content:', error);
                vscode.window.showErrorMessage('Failed to get terminal content');
                return;
            }
        } else if (editor) {
            const selection = editor.selection;
            selectedText = editor.document.getText(selection);
            hasSelection = selectedText.trim().length > 0;
            filePath = editor.document.uri.fsPath;
        } else {
            vscode.window.showErrorMessage('No active editor or terminal found');
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

        // Get workspace path
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
                `File path: ${filePath}`,
                `Workspace path: ${workspacePath}`,
                "---",
                "Selected Code:",
                "```",
                selectedText,
                "```",
            ] : []),
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