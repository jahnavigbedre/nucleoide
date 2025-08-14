const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Suppress deprecation warnings
process.removeAllListeners('warning');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: true,
      // Suppress DevTools warnings
      devTools: process.env.NODE_ENV === 'development'
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


app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for file operations
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
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error opening file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-home-directory', () => {
  // Return the current working directory instead of home directory
  return process.cwd();
}); 