# WCGW (What Could Go Wrong)

A VS Code extension that allows you to quickly send code snippets to another application with context information.

## Features

- Select code and send it to another application (configurable)
- Includes file path and workspace information
- Automatically switches to the target application
- Works on macOS

## Requirements

- macOS (for automatic application switching)
- VS Code 1.85.0 or higher

## Extension Settings

This extension contributes the following settings:

* `wcgw.targetApplication`: Specify the target application name (default: "Notes")

## How to Use

1. Select some code in your editor
2. Use the keyboard shortcut `Cmd+Shift+W` or run the command "WCGW: Send to Application" from the command palette
3. The extension will:
   - Copy the selected code with context information to the clipboard
   - Switch to your target application
   - Automatically paste the content

## Template Format

The copied text follows this template:
```
Selected Code:
[Your selected code here]

File: [absolute file path]
Workspace: [workspace path]
```

## Known Issues

- Currently only supports macOS due to the use of AppleScript for application switching
- Relies on system clipboard for data transfer

## Release Notes

### 0.0.1

Initial release of WCGW