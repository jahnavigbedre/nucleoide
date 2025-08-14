# VS Code Style File Explorer

A desktop file explorer built with Electron that mimics the VS Code file explorer UI and behavior. Built using pure HTML, CSS, and JavaScript (no React, Vue, or CSS frameworks).

## Features

- 🎨 **VS Code Dark Theme** - Authentic VS Code styling and colors
- 📁 **Collapsible Folder Tree** - Just like VS Code's explorer
- 📄 **File Type Icons** - Uses VS Code Codicons for accurate file representation
- 🖱️ **Single Click Selection** - Click to select files/folders
- 🖱️ **Double Click to Open** - Double click folders to expand, files to open
- 🖱️ **Right-Click Context Menu** - Full context menu with file operations
- 📦 **Drag and Drop** - Move files and folders by dragging
- 🔄 **Live File Monitoring** - Real-time updates when filesystem changes
- ⌨️ **Keyboard Shortcuts** - Standard file operations shortcuts
- 🎯 **Activity Bar** - VS Code-style activity bar with multiple panels

## File Operations

### Context Menu Actions
- **New File** - Create a new file in the current directory
- **New Folder** - Create a new folder in the current directory
- **Rename** - Rename files and folders (F2 shortcut)
- **Delete** - Delete files and folders (Delete key)
- **Copy/Cut** - Copy or cut items to clipboard
- **Paste** - Paste items from clipboard

### Keyboard Shortcuts
- `Ctrl/Cmd + C` - Copy selected item
- `Ctrl/Cmd + X` - Cut selected item
- `Ctrl/Cmd + V` - Paste item
- `F2` - Rename selected item
- `Delete` - Delete selected item

### Drag and Drop
- Drag files/folders to move them to different directories
- Visual feedback during drag operations
- Drop validation (only allows dropping on folders)

## Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Application**
   ```bash
   npm start
   ```

3. **Development Mode**
   ```bash
   npm run dev
   ```

## Project Structure

```
file-explorer/
├── main.js          # Electron main process
├── index.html       # Main application HTML
├── styles.css       # VS Code theme styling
├── renderer.js      # Renderer process logic
├── package.json     # Project configuration
└── README.md        # This file
```

## Technical Details

### Built With
- **Electron** - Desktop application framework
- **Node.js fs/path** - File system operations
- **Chokidar** - File system watching
- **VS Code Codicons** - Icon library
- **Pure HTML/CSS/JavaScript** - No frameworks

### Architecture
- **Main Process** (`main.js`) - Handles file system operations via IPC
- **Renderer Process** (`renderer.js`) - Manages UI and user interactions
- **Modular Design** - Clean separation of concerns

### File System Integration
- Recursive directory reading
- Real-time file system monitoring
- Cross-platform file operations
- Error handling and user feedback

## Customization

### Themes
The application uses CSS custom properties for theming. You can modify the colors in `styles.css`:

```css
:root {
    --bg-primary: #1e1e1e;      /* Main background */
    --bg-secondary: #252526;    /* Sidebar background */
    --accent-primary: #007acc;  /* Primary accent color */
    /* ... more variables */
}
```

### File Type Icons
File type icons are mapped in the `getFileIcon()` method in `renderer.js`. You can add new file extensions or modify existing ones.

### Keyboard Shortcuts
Keyboard shortcuts are handled in the `handleKeyboardShortcuts()` method. You can add new shortcuts or modify existing ones.

## Development

### Adding New Features
1. **UI Changes** - Modify `index.html` and `styles.css`
2. **Logic Changes** - Update `renderer.js`
3. **File Operations** - Add IPC handlers in `main.js`

### File Watching
The application uses Chokidar for file system monitoring. You can customize the watching behavior in the `setupFileWatcher()` method.

### Error Handling
All file operations include error handling and user feedback. Check the console for detailed error messages during development.

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Ensure the application has read/write permissions for the directories you're accessing

2. **File Watching Issues**
   - Some file systems may have limitations with file watching
   - Check the console for Chokidar warnings

3. **Performance Issues**
   - Large directories may cause performance issues
   - Consider implementing virtual scrolling for very large file trees

### Debug Mode
Run with `npm run dev` to enable developer tools and see detailed console output.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Acknowledgments

- **VS Code Team** - For the inspiration and design patterns
- **Electron Team** - For the excellent desktop framework
- **Chokidar** - For reliable file system watching
- **Codicons** - For the beautiful icon set 