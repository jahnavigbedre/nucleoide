// main.js
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
app.disableHardwareAcceleration();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');

let mainWindow;
let tempFile = null;
let installedModules = null;
let moduleCache = {}; // Cache modules by first letter

// Create a temporary file for Perl syntax checking
function createTempFile() {
  const tempDir = os.tmpdir();
  tempFile = path.join(tempDir, `perl_check_${Date.now()}.pl`);
  return tempFile;
}

// Run the FetchModules.pl script to get modules starting with a letter
async function fetchModulesByLetter(letter) {
  if (moduleCache[letter]) {
    return moduleCache[letter];
  }
  
  return new Promise((resolve, reject) => {
    // Create the FetchModules.pl script content with proper variable replacement
    const scriptContent = `use strict;
 use warnings;
 use ExtUtils::Installed;
 
 my $prefix = shift || die "Usage: $0 Prefix\\n";
 my $inst = ExtUtils::Installed->new();
 
 print "Modules starting with '$prefix':\\n";
 for my $mod ($inst->modules()) {
     print "$mod\\n" if $mod =~ /^$prefix/i;
 }`;
    
    // Write script to temp file
    const scriptFile = path.join(os.tmpdir(), `fetch_modules_${Date.now()}.pl`);
    fs.writeFileSync(scriptFile, scriptContent);
    
    // Run the script
    exec(`perl "${scriptFile}" "${letter}"`, (error, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(scriptFile); } catch (e) {}
      
      if (error) {
        console.log(`Failed to fetch modules for letter '${letter}':`, error.message);
        // Fallback to common modules for this letter
        const fallbackModules = getFallbackModulesForLetter(letter);
        moduleCache[letter] = fallbackModules;
        resolve(fallbackModules);
      } else {
        // Parse the output
        const lines = stdout.split('\n').filter(line => line.trim());
        const modules = [];
        
        lines.forEach(line => {
          if (line && !line.includes('Modules starting with')) {
            modules.push(line.trim());
          }
        });
        
        moduleCache[letter] = modules;
        console.log(`Cached ${modules.length} modules for letter '${letter}'`);
        resolve(modules);
      }
    });
  });
}
 
// Get fallback modules for a specific letter
function getFallbackModulesForLetter(letter) {
  const allModules = [
    'strict', 'warnings', 'Data::Dumper', 'JSON', 'XML::Simple',
    'LWP::Simple', 'File::Path', 'File::Copy', 'Getopt::Long',
    'Pod::Usage', 'Carp', 'Exporter', 'POSIX', 'Time::Piece',
    'DateTime', 'DBI', 'DBD::SQLite', 'Moose', 'Moo', 'Try::Tiny',
    'autodie', 'feature', 'utf8', 'open', 'FindBin', 'lib',
    'base', 'parent', 'CGI', 'HTML::Entities', 'HTTP::Request',
    'LWP::UserAgent', 'Net::FTP', 'Net::SMTP', 'Mail::Send',
    'Text::CSV', 'Spreadsheet::WriteExcel', 'Archive::Zip',
    'Compress::Zlib', 'Digest::MD5', 'Digest::SHA', 'MIME::Base64',
    'Term::ReadLine', 'Term::ANSIColor', 'IO::Handle', 'IO::File',
    'IO::Socket', 'IO::Socket::INET', 'IO::Select', 'IO::Pipe',
    'File::Spec', 'File::Basename', 'File::Glob', 'DirHandle',
    'Cwd', 'Sys::Hostname', 'Sys::Syslog', 'Time::HiRes',
    'Time::Local', 'Time::ParseDate', 'Date::Parse', 'Date::Manip'
  ];
  
  return allModules.filter(module => 
    module.toLowerCase().startsWith(letter.toLowerCase())
  );
}

// Get installed Perl modules
async function getInstalledPerlModules() {
  // Return initial common modules
  return ['strict', 'warnings', 'Data::Dumper', 'JSON', 'XML::Simple'];
}

// Get modules for a specific letter
async function getModulesForLetter(letter) {
  return await fetchModulesByLetter(letter);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'), // Optional icon
    titleBarStyle: 'default'
  });

  mainWindow.loadFile('index.html');

  // Create menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-file');
          }
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'All Files', extensions: ['*'] },
                { name: 'JavaScript', extensions: ['js', 'jsx'] },
                { name: 'TypeScript', extensions: ['ts', 'tsx'] },
                { name: 'HTML', extensions: ['html', 'htm'] },
                { name: 'CSS', extensions: ['css', 'scss', 'sass'] },
                { name: 'JSON', extensions: ['json'] },
                { name: 'Perl', extensions: ['pl', 'pm', 'perl'] },
                { name: 'Markdown', extensions: ['md', 'markdown'] }
              ]
            });
            
            if (!result.canceled) {
              const filePath = result.filePaths[0];
              try {
                const content = fs.readFileSync(filePath, 'utf8');
                mainWindow.webContents.send('file-opened', {
                  path: filePath,
                  content: content,
                  name: path.basename(filePath)
                });
              } catch (error) {
                dialog.showErrorBox('Error', `Could not open file: ${error.message}`);
              }
            }
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('menu-save-file');
          }
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow.webContents.send('menu-save-as-file');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// Handle save file request from renderer
ipcMain.handle('save-file', async (event, { path: filePath, content }) => {
  try {
    if (filePath) {
      fs.writeFileSync(filePath, content);
      return { success: true, path: filePath };
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'JavaScript', extensions: ['js'] },
          { name: 'TypeScript', extensions: ['ts'] },
          { name: 'HTML', extensions: ['html'] },
          { name: 'CSS', extensions: ['css'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'Perl', extensions: ['pl'] },
          { name: 'Markdown', extensions: ['md'] }
        ]
      });
      
      if (!result.canceled) {
        fs.writeFileSync(result.filePath, content);
        return { success: true, path: result.filePath };
      }
    }
    return { success: false };
  } catch (error) {
    dialog.showErrorBox('Error', `Could not save file: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Handle Perl module fetching
ipcMain.handle('get-perl-modules', async (event) => {
  try {
    const modules = await getInstalledPerlModules();
    return { success: true, modules: modules };
  } catch (error) {
    console.error('Error fetching Perl modules:', error);
    return { success: false, error: error.message };
  }
});

// Handle fetching modules for a specific letter
ipcMain.handle('get-modules-for-letter', async (event, letter) => {
  try {
    const modules = await getModulesForLetter(letter);
    return { success: true, modules: modules };
  } catch (error) {
    console.error('Error fetching modules for letter:', error);
    return { success: false, error: error.message };
  }
});

// Handle Perl syntax checking
ipcMain.handle('check-perl-syntax', async (event, code) => {
  try {
    // Create temp file if it doesn't exist
    if (!tempFile) {
      createTempFile();
    }
    
    // Add use warnings; at the beginning if not already present
    let codeWithWarnings = code;
    if (!code.includes('use warnings;')) {
      codeWithWarnings = 'use warnings;\n' + code;
    }
    fs.writeFileSync(tempFile, codeWithWarnings);
    
    // Run perl -cw
    return new Promise((resolve, reject) => {
      exec(`perl -cw "${tempFile}"`, (error, stdout, stderr) => {
        const output = stdout + stderr;
        
        if (error) {
          // Parse Perl error messages
          const errors = parsePerlErrors(output, code);
          resolve({ success: false, errors: errors, output: output });
        } else {
          resolve({ success: true, message: 'Syntax OK', output: output });
        }
      });
    });
  } catch (err) {
    resolve({ success: false, errors: [], output: err.message });
  }
});

// Parse Perl errors from output
function parsePerlErrors(output, originalCode) {
  const errors = [];
  const lines = output.split('\n');
  
  // Check if original code already has 'use warnings;'
  const hasWarnings = originalCode.includes('use warnings;');
  const lineOffset = hasWarnings ? 0 : 1; // Subtract 1 if we added 'use warnings;' to temp file
  
  console.log(`Original code has 'use warnings;': ${hasWarnings}, lineOffset: ${lineOffset}`);
  
  lines.forEach(line => {
    // Match syntax errors
    const syntaxMatch = line.match(/(.+?) at .+? line (\d+), near "(.+?)"/);
    if (syntaxMatch) {
      const [, message, lineNum, near] = syntaxMatch;
      const adjustedLine = parseInt(lineNum) - lineOffset;
      console.log(`Syntax error: Perl line ${lineNum} -> Editor line ${adjustedLine}`);
      errors.push({
        line: adjustedLine,
        message: message.trim(),
        severity: 'error',
        near: near
      });
      return;
    }
    
    // Match "Can't locate" module errors
    const moduleMatch = line.match(/Can't locate (.+?) in @INC/);
    if (moduleMatch) {
      // Extract line number from the error message
      const lineMatch = line.match(/line (\d+)/);
      if (lineMatch) {
        const lineNum = parseInt(lineMatch[1]);
        const adjustedLine = lineNum - lineOffset;
        console.log(`Module error: Perl line ${lineNum} -> Editor line ${adjustedLine}`);
        errors.push({
          line: adjustedLine,
          message: `Can't locate module: ${moduleMatch[1]}`,
          severity: 'error',
          near: moduleMatch[1]
        });
      }
      return;
    }
    
    // Match "Bareword" errors
    const barewordMatch = line.match(/Bareword "(.+?)" not allowed while "strict subs"/);
    if (barewordMatch) {
      // Extract line number from the error message
      const lineMatch = line.match(/line (\d+)/);
      if (lineMatch) {
        const lineNum = parseInt(lineMatch[1]);
        const adjustedLine = lineNum - lineOffset;
        console.log(`Bareword error: Perl line ${lineNum} -> Editor line ${adjustedLine}`);
        errors.push({
          line: adjustedLine,
          message: `Bareword "${barewordMatch[1]}" not allowed while "strict subs"`,
          severity: 'error',
          near: barewordMatch[1]
        });
      }
      return;
    }
    
    // Match "Global symbol" errors
    const globalMatch = line.match(/Global symbol "(.+?)" requires explicit package name/);
    if (globalMatch) {
      // Extract line number from the error message
      const lineMatch = line.match(/line (\d+)/);
      if (lineMatch) {
        const lineNum = parseInt(lineMatch[1]);
        const adjustedLine = lineNum - lineOffset;
        console.log(`Global symbol error: Perl line ${lineNum} -> Editor line ${adjustedLine}`);
        errors.push({
          line: adjustedLine,
          message: `Global symbol "${globalMatch[1]}" requires explicit package name`,
          severity: 'error',
          near: globalMatch[1]
        });
      }
      return;
    }
    
    // Match "Can't find string terminator" errors
    const terminatorMatch = line.match(/Can't find string terminator .+? anywhere before EOF at .+? line (\d+)/);
    if (terminatorMatch) {
      const lineNum = parseInt(terminatorMatch[1]);
      const adjustedLine = lineNum - lineOffset;
      console.log(`String terminator error: Perl line ${lineNum} -> Editor line ${adjustedLine}`);
      errors.push({
        line: adjustedLine,
        message: line.trim(),
        severity: 'error',
        near: 'string terminator'
      });
      return;
    }
    
    // Match "Execution of ... aborted" errors
    const abortMatch = line.match(/Execution of .+? aborted due to compilation errors/);
    if (abortMatch) {
      // This is a general compilation error, try to find the last line number
      const lastLineMatch = output.match(/line (\d+)/g);
      if (lastLineMatch && lastLineMatch.length > 0) {
        const lastLine = lastLineMatch[lastLineMatch.length - 1].match(/(\d+)/)[1];
        const adjustedLine = parseInt(lastLine) - lineOffset;
        console.log(`Compilation error: Perl line ${lastLine} -> Editor line ${adjustedLine}`);
        errors.push({
          line: adjustedLine,
          message: 'Compilation aborted due to errors',
          severity: 'error',
          near: 'compilation error'
        });
      }
      return;
    }
    
    // Match warnings
    const warningMatch = line.match(/(.+?) at .+? line (\d+)/);
    if (warningMatch && !syntaxMatch) {
      const [, message, lineNum] = warningMatch;
      if (message.includes('Unquoted string') || message.includes('Use of uninitialized value') || 
          message.includes('Name "') || message.includes('Subroutine') || message.includes('Scalar value')) {
        const adjustedLine = parseInt(lineNum) - lineOffset;
        console.log(`Warning: Perl line ${lineNum} -> Editor line ${adjustedLine}`);
        errors.push({
          line: adjustedLine,
          message: message.trim(),
          severity: 'warning'
        });
      }
    }
  });
  
  return errors;
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