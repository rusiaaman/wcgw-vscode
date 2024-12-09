# WCGW

A VS Code extension that helps you share code snippets with context to Claude. Designed to work with wcgw mcp 
https://github.com/rusiaaman/wcgw.git

## Features

- Share code snippets with custom context to Claude
- Add helpful instructions or descriptions for each share
- Works both with and without code selection

## How to Use

1. Optional: Select code you want to share
2. Press `Cmd+'` (Mac) or run command "WCGW: Send to Application"
3. Enter helpful text/instructions (or press Escape for default)
4. Extension will:
   - Switch to Claude
   - Type your instructions
   - Include code (if selected) and context information

## Example Output

With code selected:
```
Your instructions or "Here's the code context to analyze."

---
Selected Code:
```
[your selected code]
```

File: /path/to/file
Workspace: /path/to/workspace
```

Without code selected:
```
Your instructions or "Here's the code context to analyze."

File: /path/to/file
Workspace: /path/to/workspace
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

### 0.0.1

Initial release with features:
- Code sharing with custom instructions
- Works with or without code selection
- File and workspace context
- Reliable text entry through keyboard simulation