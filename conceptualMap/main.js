const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('@lydell/node-pty');

// Suppress deprecation warnings
process.removeAllListeners('warning');

let mainWindow;

// Directory caching functionality
const CACHE_FILE = path.join(os.homedir(), '.conceptualmap-cache.json');

function saveLastDirectory(directoryPath) {
  try {
    const cache = { lastDirectory: directoryPath };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log('Saved last directory to cache:', directoryPath);
  } catch (error) {
    console.error('Error saving last directory:', error);
  }
}

function loadLastDirectory() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.log('Loaded last directory from cache:', cache.lastDirectory);
      return cache.lastDirectory;
    }
  } catch (error) {
    console.error('Error loading last directory:', error);
  }
  // Fallback to current working directory
  return process.cwd();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Custom title bar from second file
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    },
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ========== TERMINAL LOGIC ========== //
// Map of terminal types to their PTY processes
const terminalTypes = {
  powershell: {
    shell: os.platform() === 'win32' ? 'powershell.exe' : 'bash',
    pty: null
  },
  bash: {
    shell: os.platform() === 'win32' ? 'bash.exe' : 'bash',
    pty: null
  },
  nodejs: {
    shell: process.execPath, // Node.js executable
    pty: null
  }
};

function spawnAllTerminals() {
  Object.entries(terminalTypes).forEach(([type, info]) => {
    if (info.pty) return; // Already spawned
    let args = [];
    if (type === 'nodejs') args = ['-i']; // Interactive node shell
    info.pty = pty.spawn(info.shell, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || process.cwd(),
      env: process.env
    });
    info.pty.on('data', (data) => {
      if (mainWindow) mainWindow.webContents.send(`terminal-output-${type}`, data);
    });
  });
}

ipcMain.on('terminal-input', (event, { type, data }) => {
  if (terminalTypes[type] && terminalTypes[type].pty) {
    terminalTypes[type].pty.write(data);
  }
});

ipcMain.on('resize-terminal', (event, { type, cols, rows }) => {
  if (terminalTypes[type] && terminalTypes[type].pty) {
    terminalTypes[type].pty.resize(cols, rows);
  }
});

ipcMain.on('init-terminals', () => {
  spawnAllTerminals();
});

app.whenReady().then(() => {
  // Optional: Clear cache on start (from second file)
  session.defaultSession.clearCache().then(() => {
    console.log('Cache cleared');
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Window control IPC handlers (from second file)
ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// IPC handlers for file operations (from first file)
ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      path: path.join(dirPath, item.name)
    }));
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
});

ipcMain.handle('create-file', async (event, filePath) => {
  try {
    await fs.promises.writeFile(filePath, '');
    return { success: true };
  } catch (error) {
    console.error('Error creating file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-folder', async (event, folderPath) => {
  try {
    await fs.promises.mkdir(folderPath, { recursive: true });
    return { success: true };
  } catch (error) {
    console.error('Error creating folder:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rename-item', async (event, oldPath, newPath) => {
  try {
    await fs.promises.rename(oldPath, newPath);
    return { success: true };
  } catch (error) {
    console.error('Error renaming item:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-item', async (event, itemPath) => {
  try {
    const stats = await fs.promises.stat(itemPath);
    if (stats.isDirectory()) {
      await fs.promises.rmdir(itemPath, { recursive: true });
    } else {
      await fs.promises.unlink(itemPath);
    }
    return { success: true };
  } catch (error) {
    console.error('Error deleting item:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('move-item', async (event, sourcePath, destinationPath) => {
  try {
    await fs.promises.rename(sourcePath, destinationPath);
    return { success: true };
  } catch (error) {
    console.error('Error moving item:', error);
    return { success: false, error: error.message };
  }
});

// Helper function to copy directory recursively
async function copyDirectoryRecursive(sourcePath, destinationPath) {
  await fs.promises.mkdir(destinationPath, { recursive: true });
  const items = await fs.promises.readdir(sourcePath);

  for (const item of items) {
    const sourceItemPath = path.join(sourcePath, item);
    const destItemPath = path.join(destinationPath, item);
    const itemStats = await fs.promises.stat(sourceItemPath);

    if (itemStats.isDirectory()) {
      await copyDirectoryRecursive(sourceItemPath, destItemPath);
    } else {
      await fs.promises.copyFile(sourceItemPath, destItemPath);
    }
  }
}

ipcMain.handle('copy-item', async (event, sourcePath, destinationPath) => {
  try {
    const stats = await fs.promises.stat(sourcePath);

    if (stats.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, destinationPath);
    } else {
      await fs.promises.copyFile(sourcePath, destinationPath);
    }

    return { success: true };
  } catch (error) {
    console.error('Error copying item:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-file', async (event, filePath) => {
  try {
    console.log('Opening file/folder:', filePath);
    await shell.openPath(filePath);
    console.log('Successfully opened:', filePath);
    return { success: true };
  } catch (error) {
    console.error('Error opening file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-folder-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Folder to Open'
    });

    if (result.canceled) {
      return { success: true, cancelled: true };
    } else {
      const folderPath = result.filePaths[0];
      console.log('User selected folder:', folderPath);

      // Save the selected folder to cache
      saveLastDirectory(folderPath);

      return { success: true, folderPath: folderPath };
    }
  } catch (error) {
    console.error('Error opening folder dialog:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-current-directory', (event, directoryPath) => {
  saveLastDirectory(directoryPath);
  return { success: true };
});

ipcMain.handle('get-home-directory', () => {
  // Return the cached last directory or current working directory as fallback
  return loadLastDirectory();
});

// Monaco Editor file operations
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { success: true, content: content };
  } catch (error) {
    console.error('Error reading file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-file', async (event, { path: filePath, content }) => {
  try {
    if (filePath) {
      await fs.promises.writeFile(filePath, content);
      return { success: true, path: filePath };
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Perl', extensions: ['pl', 'pm'] },
          { name: 'Python', extensions: ['py'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'Markdown', extensions: ['md'] }
        ]
      });

      if (!result.canceled) {
        await fs.promises.writeFile(result.filePath, content);
        return { success: true, path: result.filePath };
      }
    }
    return { success: false };
  } catch (error) {
    console.error('Error saving file:', error);
    return { success: false, error: error.message };
  }
});

// Perl syntax checking functionality
const { exec } = require('child_process');

// Create a temporary file for Perl syntax checking
function createTempFile() {
  const tempDir = os.homedir();
  return path.join(tempDir, `perl_check_${Date.now()}.pl`);
}

// Parse Perl errors from output
function parsePerlErrors(output, originalCode) {
  const errors = [];
  const lines = output.split('\n');

  console.log('Parsing Perl errors from output:', output);
  console.log('Lines to parse:', lines);

  // Check if original code already has any form of 'use warnings' directive
  // This handles 'use warnings;', 'use warning;' (typo), etc.
  const hasWarningsDirective = /use\s+warnings?\s*;/i.test(originalCode);
  const lineOffset = hasWarningsDirective ? 0 : 1;
  
  console.log('Has warnings directive:', hasWarningsDirective, 'Line offset:', lineOffset);

  lines.forEach((line, index) => {
    console.log(`Processing line ${index}: "${line}"`);
    
    // Match syntax errors with "at [file] line [number], near [text]" format
    const syntaxMatch = line.match(/(.+?) at .+? line (\d+), near "(.+?)"/);
    if (syntaxMatch) {
      const [, message, lineNum, near] = syntaxMatch;
      const adjustedLine = parseInt(lineNum) - lineOffset;
      console.log('Found syntax error:', { message, lineNum, adjustedLine, near });
      errors.push({
        line: Math.max(1, adjustedLine),
        message: message.trim(),
        severity: 'error',
        near: near
      });
      return;
    }

    // Match errors with "at [file] line [number], at end of line" format
    const endOfLineMatch = line.match(/(.+?) at .+? line (\d+), at end of line/);
    if (endOfLineMatch) {
      const [, message, lineNum] = endOfLineMatch;
      const adjustedLine = parseInt(lineNum) - lineOffset;
      console.log('Found end-of-line error:', { message, lineNum, adjustedLine });
      errors.push({
        line: Math.max(1, adjustedLine),
        message: message.trim(),
        severity: 'error'
      });
      return;
    }

    // Match simple "syntax error at [file] line [number]" format
    const simpleErrorMatch = line.match(/(.+?) at .+? line (\d+)$/);
    if (simpleErrorMatch && line.includes('syntax error')) {
      const [, message, lineNum] = simpleErrorMatch;
      const adjustedLine = parseInt(lineNum) - lineOffset;
      console.log('Found simple syntax error:', { message, lineNum, adjustedLine });
      errors.push({
        line: Math.max(1, adjustedLine),
        message: message.trim(),
        severity: 'error'
      });
      return;
    }

    // Match "Global symbol" errors with "at [file] line [number]" format
    const globalSymbolMatch = line.match(/Global symbol "(.+?)" requires explicit package name.*? at .+? line (\d+)/);
    if (globalSymbolMatch) {
      const [, symbol, lineNum] = globalSymbolMatch;
      const adjustedLine = parseInt(lineNum) - lineOffset;
      console.log('Found global symbol error:', { symbol, lineNum, adjustedLine });
      errors.push({
        line: Math.max(1, adjustedLine),
        message: `Global symbol "${symbol}" requires explicit package name (did you forget to declare "my ${symbol}"?)`,
        severity: 'error',
        near: symbol
      });
      return;
    }

    // Match other common Perl compilation errors with "at [file] line [number]" format
    const compilationErrorMatch = line.match(/(.+?) at .+? line (\d+)(?:, (.+))?$/);
    if (compilationErrorMatch && 
        !syntaxMatch && !endOfLineMatch && !simpleErrorMatch && !globalSymbolMatch &&
        (line.includes('requires explicit package name') || 
         line.includes('Bareword') || 
         line.includes('String found where operator expected') ||
         line.includes('Undefined subroutine') ||
         line.includes('Can\'t use'))) {
      const [, message, lineNum, additional] = compilationErrorMatch;
      const adjustedLine = parseInt(lineNum) - lineOffset;
      console.log('Found compilation error:', { message, lineNum, adjustedLine, additional });
      errors.push({
        line: Math.max(1, adjustedLine),
        message: message.trim() + (additional ? `, ${additional}` : ''),
        severity: 'error'
      });
      return;
    }

    // Match "Can't locate" module errors
    const moduleMatch = line.match(/Can't locate (.+?) in @INC/);
    if (moduleMatch) {
      const lineMatch = line.match(/line (\d+)/);
      if (lineMatch) {
        const lineNum = parseInt(lineMatch[1]);
        const adjustedLine = lineNum - lineOffset;
        errors.push({
          line: Math.max(1, adjustedLine),
          message: `Can't locate module: ${moduleMatch[1]}`,
          severity: 'error',
          near: moduleMatch[1]
        });
      }
      return;
    }

    // Match warnings
    const warningMatch = line.match(/(.+?) at .+? line (\d+)/);
    if (warningMatch && !syntaxMatch && !endOfLineMatch && !simpleErrorMatch && !globalSymbolMatch && !compilationErrorMatch) {
      const [, message, lineNum] = warningMatch;
      if (message.includes('Unquoted string') || message.includes('Use of uninitialized value') ||
        message.includes('Name "') || message.includes('Subroutine') || message.includes('Scalar value')) {
        const adjustedLine = parseInt(lineNum) - lineOffset;
        console.log('Found warning:', { message, lineNum, adjustedLine });
        errors.push({
          line: Math.max(1, adjustedLine),
          message: message.trim(),
          severity: 'warning'
        });
      }
    }
  });

  console.log('Final parsed errors:', errors);
  return errors;
}

ipcMain.handle('check-perl-syntax', async (event, code) => {
  try {
    const tempFile = createTempFile();

    // Add use warnings; at the beginning if not already present
    // Check for any form of warnings directive (including typos like 'use warning;')
    let codeWithWarnings = code;
    if (!/use\s+warnings?\s*;/i.test(code)) {
      codeWithWarnings = 'use warnings;\n' + code;
    }
    await fs.promises.writeFile(tempFile, codeWithWarnings);

    // Run perl -cw
    return new Promise((resolve) => {
      exec(`perl -cw "${tempFile}"`, (error, stdout, stderr) => {
        const output = stdout + stderr;

        // Clean up temp file
        fs.promises.unlink(tempFile).catch(() => { });

        if (error) {
          const errors = parsePerlErrors(output, code);
          resolve({ success: false, errors: errors, output: output });
        } else {
          resolve({ success: true, message: 'Syntax OK', output: output });
        }
      });
    });
  } catch (err) {
    return { success: false, errors: [], output: err.message };
  }
});