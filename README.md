# WCGW (What Could Go Wrong)

A VS Code extension that helps you share code snippets and context with other applications, ideal for working with AI assistants, documentation tools, or code review platforms.

## Features

- Share code snippets with custom context to any application
- Add helpful instructions or descriptions for each share
- Works both with and without code selection
- Includes file and workspace context
- Automatically switches to and focuses target application
- Reliable text entry through keyboard simulation

## How to Use

1. Optional: Select code you want to share
2. Press `Cmd+/` (Mac) or run command "WCGW: Send to Application"
3. Enter helpful text/instructions (or press Escape for default)
4. Extension will:
   - Switch to target application
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

## Technical Notes

- Uses keyboard simulation for reliable text entry
- Short delay between app switch and text entry for stability
- Works with any application that accepts text input

## Known Issues

- macOS only currently
- May not work with applications that have unusual text input handling

## Release Notes

### 0.0.1

Initial release with features:
- Code sharing with custom instructions
- Works with or without code selection
- File and workspace context
- Reliable text entry through keyboard simulation