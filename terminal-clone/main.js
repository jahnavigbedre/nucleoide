const { app, BrowserWindow, ipcMain } = require('electron');
const pty = require('@lydell/node-pty');
const os = require('os');

let mainWindow;

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 400,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
});

const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env
});

ptyProcess.on('data', (data) => {
    mainWindow.webContents.send('terminal-output', data);
});

ipcMain.on('terminal-input', (event, data) => {
    ptyProcess.write(data);
});

// Handle terminal resize from renderer
ipcMain.on('resize-terminal', (event, size) => {
    if (ptyProcess) {
        ptyProcess.resize(size.cols, size.rows);
    }
});
