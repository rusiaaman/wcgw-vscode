# WCGW

A Mac only VS Code extension that helps you share code snippets with context to Claude. Designed to work with wcgw mcp 
https://github.com/rusiaaman/wcgw.git


## Features

- Share code snippets from editor with context to Claude
- Share terminal output with context
- Add helpful instructions or descriptions for each share
- Works with editor or terminal selections
- Capture and share screenshots directly to target application

## How to Use

Warning: this uses apple script. Make sure you don't press "Cmd" while the tool is doing its job.

### For Editor Content
1. Select code in the editor you want to share
2. Press `Cmd+'` or run command "WCGW: Send Editor Selection to Application"
3. Enter helpful text/instructions (or press Escape for default)
4. Extension will:
   - Switch to Claude
   - Type your instructions
   - Include selected code and context information
5. Press `Cmd+Shift+'` to copy the selected code with additional context:
   - Repository structure
   - Frequently relevant files (e.g., package.json, pyproject.toml, Readme.md, etc., listing at least 20 such files)


### For Terminal Output
1. Select text in the terminal
2. Press `Cmd+'` (Mac) or run command "WCGW: Send Terminal Selection to Application"
3. Enter helpful text/instructions (or press Escape for default)
4. Extension will:
   - Switch to Claude
   - Type your instructions
   - Include terminal output and context information
5. Press `Cmd+Shift+'` to copy terminal output with additional context:
   - Repository structure
   - Frequently relevant files (e.g., package.json, pyproject.toml, Readme.md, etc., listing at least 20 such files)

### For Screenshots
1. Press `Cmd+Shift+8` while in VS Code
2. Optionally, switch to chrome or any other application.
2. Select any area of your screen using the selection tool
3. The screenshot will be copied to clipboard.
4. Claude will open and the screenshot will be pasted.

## Example Output

### Editor Selection
```
Your instructions or "Here's the code to analyze."

---
Workspace path: /path/to/workspace
---
File path: /path/to/file
---
Selected code:
```
[your selected code]
```
```

### Terminal Selection
```
Your instructions or "Here's the terminal output to analyze."

---
Workspace path: /path/to/workspace
---
Terminal output:
```
[your terminal selection]
```
```

## Extension Settings

This extension contributes the following settings:

* `wcgw.targetApplication`: Name of the application to send code to (default: "Claude")

## Requirements

- macOS (required for automatic application switching)
- VS Code 1.85.0 or higher

## Known Issues

- macOS only currently

## Release Notes

### 0.3.3
- Added screenshot capture functionality (Cmd+Shift+8)
- Select any area of screen and paste directly to target application

### 0.1.0

Added features:
- Split into separate editor and terminal commands
- New keybinding (Cmd+Shift+') for terminal selections
- Improved error messages and context information
- Better formatting of output

### 0.0.1

Initial release with features:
- Code sharing with custom instructions
- Works with or without code selection
- File and workspace context
- Reliable text entry through keyboard simulation