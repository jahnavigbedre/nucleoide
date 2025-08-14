class MonacoEditor {
    constructor() {
        this.editor = null;
        this.currentFilePath = null;
        this.completionProviders = [];
        this.modules = [];
        this.isInitialized = false;
        this.openTabs = new Map(); // Store open tabs: filePath -> { name, content, modified }
        this.activeTab = null;

        // Don't auto-initialize Monaco - wait for first file click
        this.loadModules(); // Still load modules for completion
        this.setupEventListeners();
        this.showWelcomeScreen();
    }

    showWelcomeScreen() {
        // Properly dispose of the Monaco editor if it exists
        if (this.editor) {
            this.editor.dispose();
            this.editor = null;
        }
        
        const container = document.getElementById('monaco-editor-container');
        if (container) {
            container.innerHTML = `
                <div style="
                    width: 100%; 
                    height: 100%; 
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    color: #cccccc; 
                    background: #1e1e1e;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    text-align: center;
                    padding: 40px;
                ">
                    <div style="font-size: 24px; margin-bottom: 20px; color: #569cd6;">
                        📝 Perl Editor
                    </div>
                    <div style="font-size: 16px; margin-bottom: 30px; color: #9cdcfe;">
                        Welcome to your Perl Development Environment
                    </div>
                    <div style="font-size: 14px; color: #6a9955; line-height: 1.6;">
                        🗂️ Click on any file in the explorer to start editing<br>
                        ✨ Monaco Editor with Perl syntax highlighting<br>
                        🔍 IntelliSense and auto-completion<br>
                        ⚡ Real-time syntax checking<br>
                        📁 Multiple tabs support
                    </div>
                    <div style="margin-top: 40px; font-size: 12px; color: #858585;">
                        Select a file from the File Explorer to begin...
                    </div>
                </div>`;
        }
        
        // Update breadcrumb to show welcome state
        this.updateBreadcrumbPath(null, null);
        const breadcrumbCursor = document.getElementById('breadcrumb-cursor');
        if (breadcrumbCursor) {
            breadcrumbCursor.textContent = '';
        }
    }

    async initMonaco() {
        try {
            console.log('Starting Monaco initialization...');

            // First ensure the container is visible
            const container = document.getElementById('monaco-editor-container');
            if (!container) {
                throw new Error('Monaco container not found');
            }

            // Make sure container is visible for testing
            container.style.display = 'block';
            container.style.visibility = 'visible';

            // Load modules.json for completion providers
            await this.loadModules();

            // Load Monaco Editor from unpkg.com CDN
            await this.loadMonacoFromCDN();

            // Initialize the editor
            this.createEditor();

            console.log('Monaco Editor initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Monaco Editor:', error);
            this.showError('Failed to load Monaco Editor: ' + error.message);

            // Show fallback content
            const container = document.getElementById('monaco-editor-container');
            if (container) {
                container.innerHTML = `
                    <div style="
                        width: 100%; 
                        height: 100%; 
                        min-height: 35px;
                        padding: 20px; 
                        color: #cccccc; 
                        background: #1e1e1e;
                        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                        font-size: 14px;
                        border: 1px solid #f44336;
                        box-sizing: border-box;
                        display: flex;
                        flex-direction: column;
                    ">
                        <div style="color: #f44336; margin-bottom: 10px;">
                            ❌ Monaco Editor failed to load: ${error.message}
                        </div>
                        <div style="color: #ffa726; margin-bottom: 10px;">
                            📝 Using fallback text editor
                        </div>
                        <textarea id="fallback-editor" style="
                            flex: 1;
                            width: 100%; 
                            min-height: 50px;
                            padding: 10px; 
                            color: #cccccc; 
                            background: #2d2d30;
                            border: 1px solid #444;
                            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                            font-size: 14px;
                            resize: none;
                            outline: none;
                        " placeholder="Click on a file in the explorer to edit..."># Fallback Text Editor
# Monaco Editor failed to load, but you can still edit files here
# 
# Click on a .pl, .py, .json, or .md file in the explorer to open it

use strict;
use warnings;

print "Hello, World!\\n";

# This is a basic but functional text editor</textarea>
                    </div>`;

                // Set up file opening for fallback editor
                this.setupFallbackEditor();
            }
        }
    }

    // Tab management methods
    async openFileInTab(filePath, fileName) {
        try {
            // Initialize Monaco if not already done OR if editor was destroyed
            if (!this.isInitialized || !this.editor) {
                await this.initMonaco();
                this.isInitialized = true;
            }

            // Read file content using Electron API
            const result = await window.electronAPI.readFile(filePath);
            if (!result.success) {
                throw new Error(result.error);
            }
            const content = result.content;

            // Check if tab already exists
            if (this.openTabs.has(filePath)) {
                this.switchToTab(filePath);
                return;
            }

            // Create new tab
            this.openTabs.set(filePath, {
                name: fileName,
                content: content,
                modified: false,
                originalContent: content
            });

            // Create tab UI element
            this.createTabElement(filePath, fileName);

            // Switch to this tab
            this.switchToTab(filePath);

        } catch (error) {
            console.error('Error opening file:', error);
            this.showError('Failed to open file: ' + error.message);
        }
    }

    createTabElement(filePath, fileName) {
        const tabBar = document.querySelector('.editor-tab-bar');
        const existingTabs = tabBar.querySelectorAll('.editor-tab[data-file-path]');
        
        // Remove default tabs if they exist
        const defaultTabs = tabBar.querySelectorAll('.editor-tab:not([data-file-path])');
        defaultTabs.forEach(tab => tab.remove());

        // Create new tab
        const tabElement = document.createElement('div');
        tabElement.className = 'editor-tab';
        tabElement.setAttribute('data-file-path', filePath);
        
        // Determine file icon based on extension
        const ext = fileName.split('.').pop().toLowerCase();
        let icon = '📄'; // Default file icon
        
        switch (ext) {
            case 'pl':
            case 'pm':
            case 'perl':
                icon = '🔷'; // Perl
                break;
            case 'py':
                icon = '🐍'; // Python
                break;
            case 'js':
            case 'jsx':
                icon = '📜'; // JavaScript
                break;
            case 'ts':
            case 'tsx':
                icon = '🔷'; // TypeScript
                break;
            case 'json':
                icon = '📋'; // JSON
                break;
            case 'html':
            case 'htm':
                icon = '🌐'; // HTML
                break;
            case 'css':
                icon = '🎨'; // CSS
                break;
            case 'scss':
            case 'less':
                icon = '🎨'; // CSS preprocessors
                break;
            case 'md':
            case 'markdown':
                icon = '�'; // Markdown
                break;
            case 'php':
                icon = '🐘'; // PHP
                break;
            case 'xml':
                icon = '📰'; // XML
                break;
            case 'yaml':
            case 'yml':
                icon = '⚙️'; // YAML
                break;
            case 'sql':
                icon = '�️'; // SQL
                break;
            case 'sh':
            case 'bash':
                icon = '⚡'; // Shell
                break;
            case 'cpp':
            case 'c':
            case 'h':
                icon = '⚙️'; // C/C++
                break;
            case 'java':
                icon = '☕'; // Java
                break;
            case 'rb':
                icon = '💎'; // Ruby
                break;
            case 'go':
                icon = '�'; // Go
                break;
            case 'rs':
                icon = '🦀'; // Rust
                break;
            case 'txt':
            case 'log':
                icon = '📝'; // Text files
                break;
            default:
                icon = '�'; // Default
                break;
        }

        tabElement.innerHTML = `
            <span class="tab-icon">${icon}</span>
            <span class="tab-name">${fileName}</span>
            <span class="tab-modified-indicator">●</span>
            <span class="tab-close" data-file-path="${filePath}">×</span>
        `;

        // Add event listeners
        tabElement.addEventListener('click', (e) => {
            console.log('Tab clicked:', filePath);
            if (!e.target.classList.contains('tab-close')) {
                this.switchToTab(filePath);
            }
        });

        tabElement.querySelector('.tab-close').addEventListener('click', (e) => {
            console.log('Close button clicked for:', filePath);
            e.stopPropagation();
            e.preventDefault();
            this.closeTab(filePath);
        });

        // Insert before tab actions
        const tabActions = tabBar.querySelector('.editor-tab-actions');
        tabBar.insertBefore(tabElement, tabActions);
        
        console.log('Created tab element for:', filePath);
        console.log('Tab element classes:', tabElement.className);
        console.log('Tab element data-file-path:', tabElement.getAttribute('data-file-path'));
    }

    // Helper function to detect language based on file extension
    getLanguageFromFileName(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        
        switch (ext) {
            case 'pl':
            case 'pm':
            case 'perl':
                return 'perl';
            case 'py':
                return 'python';
            case 'js':
            case 'jsx':
                return 'javascript';
            case 'ts':
            case 'tsx':
                return 'typescript';
            case 'json':
                return 'json';
            case 'html':
            case 'htm':
                return 'html';
            case 'css':
                return 'css';
            case 'scss':
                return 'scss';
            case 'less':
                return 'less';
            case 'md':
            case 'markdown':
                return 'markdown';
            case 'php':
                return 'php';
            case 'xml':
                return 'xml';
            case 'yaml':
            case 'yml':
                return 'yaml';
            case 'sql':
                return 'sql';
            case 'sh':
            case 'bash':
                return 'shell';
            case 'cpp':
            case 'c':
            case 'h':
                return 'cpp';
            case 'java':
                return 'java';
            case 'rb':
                return 'ruby';
            case 'go':
                return 'go';
            case 'rs':
                return 'rust';
            case 'txt':
            case 'log':
                return 'plaintext';
            default:
                return 'plaintext';
        }
    }

    // Helper function to check if a file is a Perl file
    isPerlFile(filePath) {
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
        const ext = fileName.split('.').pop().toLowerCase();
        return ['pl', 'pm', 'perl'].includes(ext);
    }

    switchToTab(filePath) {
        console.log('switchToTab called with:', filePath);
        console.log('Current activeTab:', this.activeTab);
        
        // Set the active tab state FIRST
        this.activeTab = filePath;
        
        // Update ALL tab UI states
        this.updateAllTabStates();

        // Update editor content
        const tabData = this.openTabs.get(filePath);
        if (tabData && this.editor) {
            this.currentFilePath = filePath;
            this.editor.setValue(tabData.content);
            
            // Set language based on file extension
            const language = this.getLanguageFromFileName(tabData.name);
            monaco.editor.setModelLanguage(this.editor.getModel(), language);
            console.log(`Set language to: ${language} for file: ${tabData.name}`);
            
            // Clear Perl syntax error markers for non-Perl files
            if (!this.isPerlFile(filePath)) {
                monaco.editor.setModelMarkers(this.editor.getModel(), 'perl', []);
            }
            
            this.editor.focus();

            // Update status bar
            this.updateStatusMessage(`Editing: ${tabData.name}`, '#569cd6');
            
            // Update breadcrumb with file path
            this.updateBreadcrumbPath(filePath, tabData.name);
            
            // Update window title if it exists
            const titleElement = document.querySelector('.editor-tab.active .tab-name');
            if (titleElement) {
                document.title = `${tabData.name} - Perl Editor`;
            }
        }
        
        console.log('switchToTab completed. New activeTab:', this.activeTab);
    }

    // New method to update all tab states based on activeTab
    updateAllTabStates() {
        console.log('updateAllTabStates called. activeTab:', this.activeTab);
        
        const allTabs = document.querySelectorAll('.editor-tab[data-file-path]');
        console.log('Found', allTabs.length, 'tabs to update');
        
        allTabs.forEach((tab, index) => {
            const tabPath = tab.getAttribute('data-file-path');
            const wasActive = tab.classList.contains('active');
            
            if (tabPath === this.activeTab) {
                if (!wasActive) {
                    tab.classList.add('active');
                    console.log(`✅ Added active class to tab ${index}: ${tabPath}`);
                } else {
                    console.log(`ℹ️ Tab ${index} already active: ${tabPath}`);
                }
            } else {
                if (wasActive) {
                    tab.classList.remove('active');
                    console.log(`➖ Removed active class from tab ${index}: ${tabPath}`);
                } else {
                    console.log(`ℹ️ Tab ${index} already inactive: ${tabPath}`);
                }
            }
            
            console.log(`Tab ${index} final state: ${tabPath} -> active: ${tab.classList.contains('active')}`);
        });
    }

    closeTab(filePath) {
        console.log('closeTab called for:', filePath);
        const tabData = this.openTabs.get(filePath);
        if (!tabData) {
            console.log('No tab data found for:', filePath);
            return;
        }

        console.log('Tab data found:', tabData);

        // Check if file is modified
        if (tabData.modified) {
            const shouldSave = confirm(`${tabData.name} has unsaved changes. Save before closing?`);
            if (shouldSave) {
                this.saveFile();
            }
        }

        // Remove tab from storage
        this.openTabs.delete(filePath);

        // Remove tab element with more robust selection
        console.log('Looking for tab element with path:', filePath);
        const tabElements = document.querySelectorAll(`.editor-tab[data-file-path="${filePath}"]`);
        console.log('Found tab elements:', tabElements.length);
        
        if (tabElements.length > 0) {
            tabElements.forEach((tabElement, index) => {
                console.log(`Removing tab element ${index}:`, tabElement);
                tabElement.remove();
            });
        } else {
            console.log('No tab elements found for:', filePath);
            // Try alternative selector in case of escaping issues
            const allTabs = document.querySelectorAll('.editor-tab[data-file-path]');
            console.log('All tabs with data-file-path:', allTabs.length);
            allTabs.forEach(tab => {
                const tabPath = tab.getAttribute('data-file-path');
                console.log('Tab path:', tabPath);
                if (tabPath === filePath) {
                    console.log('Found matching tab by manual comparison, removing...');
                    tab.remove();
                }
            });
        }

        // If this was the active tab, switch to another or show welcome screen
        if (this.activeTab === filePath) {
            console.log('Closing active tab, switching to another or welcome screen');
            const remainingTabs = Array.from(this.openTabs.keys());
            if (remainingTabs.length > 0) {
                console.log('Switching to remaining tab:', remainingTabs[0]);
                this.switchToTab(remainingTabs[0]);
            } else {
                console.log('No remaining tabs, showing welcome screen');
                this.showWelcomeScreen();
                this.activeTab = null;
                this.currentFilePath = null;
                document.title = 'Perl Editor';
            }
        }

        // Force update of all tab active states
        this.updateAllTabStates();
    }

    // Save current tab
    async saveFile() {
        if (!this.activeTab || !this.editor) return;

        try {
            const content = this.editor.getValue();
            
            // Use Electron API to save file
            const result = await window.electronAPI.saveFile({
                path: this.activeTab,
                content: content
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            // Update tab data
            const tabData = this.openTabs.get(this.activeTab);
            if (tabData) {
                tabData.content = content;
                tabData.originalContent = content;
                tabData.modified = false;

                // Update tab appearance (remove modified indicator) - use robust selection
                const allTabs = document.querySelectorAll('.editor-tab[data-file-path]');
                let tabElement = null;
                for (const tab of allTabs) {
                    if (tab.getAttribute('data-file-path') === this.activeTab) {
                        tabElement = tab;
                        break;
                    }
                }
                
                if (tabElement) {
                    tabElement.classList.remove('modified');
                    console.log('Removed modified class from tab:', this.activeTab);
                }
            }

            this.updateStatusMessage('File saved successfully', '#4ec9b0');
            console.log('File saved:', this.activeTab);

        } catch (error) {
            console.error('Error saving file:', error);
            this.updateStatusMessage('Error saving file: ' + error.message, '#f44336');
        }
    }

    async saveAsFile() {
        if (!this.editor) return;

        try {
            const content = this.editor.getValue();
            
            // Use Electron API to save file with dialog (no path specified)
            const result = await window.electronAPI.saveFile({
                path: null, // This will trigger the save dialog
                content: content
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            const newFilePath = result.path;
            const newFileName = newFilePath.split(/[/\\]/).pop();
            
            // If this is a new file path, update everything
            if (newFilePath !== this.activeTab) {
                // Remove old tab data if it exists
                if (this.activeTab) {
                    this.openTabs.delete(this.activeTab);
                    
                    // Remove old tab element
                    const allTabs = document.querySelectorAll('.editor-tab[data-file-path]');
                    for (const tab of allTabs) {
                        if (tab.getAttribute('data-file-path') === this.activeTab) {
                            tab.remove();
                            break;
                        }
                    }
                }

                // Create new tab data
                this.openTabs.set(newFilePath, {
                    name: newFileName,
                    content: content,
                    modified: false,
                    originalContent: content
                });

                // Create new tab element
                this.createTabElement(newFilePath, newFileName);
                
                // Update active tab
                this.activeTab = newFilePath;
                this.currentFilePath = newFilePath;
                
                // Update tab states
                this.updateAllTabStates();
                
                // Update breadcrumb
                this.updateBreadcrumbPath(newFilePath, newFileName);
                
                // Update window title
                document.title = `${newFileName} - Perl Editor`;
            } else {
                // Same file, just update the saved state
                const tabData = this.openTabs.get(this.activeTab);
                if (tabData) {
                    tabData.content = content;
                    tabData.originalContent = content;
                    tabData.modified = false;

                    // Remove modified indicator
                    const allTabs = document.querySelectorAll('.editor-tab[data-file-path]');
                    let tabElement = null;
                    for (const tab of allTabs) {
                        if (tab.getAttribute('data-file-path') === this.activeTab) {
                            tabElement = tab;
                            break;
                        }
                    }
                    
                    if (tabElement) {
                        tabElement.classList.remove('modified');
                    }
                }
            }

            this.updateStatusMessage('File saved as: ' + newFileName, '#4ec9b0');
            console.log('File saved as:', newFilePath);

        } catch (error) {
            console.error('Error saving file as:', error);
            this.updateStatusMessage('Error saving file: ' + error.message, '#f44336');
        }
    }

    async loadModules() {
        try {
            const fs = require('fs');
            const path = require('path');
            const modulesPath = path.join(__dirname, 'modules.json');

            if (fs.existsSync(modulesPath)) {
                const data = fs.readFileSync(modulesPath, 'utf8');
                const parsedData = JSON.parse(data);

                // Store the complete parsed data including moduleFunctions
                this.modules = parsedData;

                console.log('Loaded modules for completion:',
                    parsedData.modules ? parsedData.modules.length : 0,
                    'modules and',
                    parsedData.moduleFunctions ? Object.keys(parsedData.moduleFunctions).length : 0,
                    'module function sets');
            } else {
                console.log('modules.json not found, using fallback modules');
                this.modules = { modules: [], moduleFunctions: {} };
            }
        } catch (error) {
            console.error('Failed to load modules.json:', error);
            this.modules = { modules: [], moduleFunctions: {} };
        }
    }

    async loadMonacoFromCDN() {
        return new Promise((resolve, reject) => {
            // Check if Monaco is already loaded
            if (window.monaco) {
                console.log('Monaco already loaded');
                resolve();
                return;
            }

            console.log('Loading Monaco Editor from CDN...');

            // First load the loader
            const loaderScript = document.createElement('script');
            loaderScript.src = 'monaco/loader.js';

            loaderScript.onload = () => {
                console.log('Monaco loader script loaded');

                // Set up a timeout for Monaco loading
                const timeout = setTimeout(() => {
                    console.error('Monaco Editor loading timeout after 10 seconds');
                    reject(new Error('Monaco Editor loading timeout'));
                }, 10000);

                try {
                    // Configure the loader
                    require.config({
                        paths: {
                            'vs': 'monaco'
                        }
                    });

                    // Load the editor
                    require(['vs/editor/editor.main'], function () {
                        clearTimeout(timeout);
                        console.log('Monaco Editor loaded successfully');
                        resolve();
                    }, function (err) {
                        clearTimeout(timeout);
                        console.error('Failed to load Monaco Editor:', err);
                        reject(new Error('Failed to load Monaco Editor: ' + err));
                    });
                } catch (error) {
                    clearTimeout(timeout);
                    console.error('Error configuring Monaco loader:', error);
                    reject(new Error('Monaco loader configuration failed: ' + error.message));
                }
            };

            loaderScript.onerror = (error) => {
                console.error('Failed to load Monaco loader script:', error);
                reject(new Error('Failed to load Monaco loader script'));
            };

            document.head.appendChild(loaderScript);
        });
    } createEditor() {
        console.log('Creating Monaco Editor...');

        const container = document.getElementById('monaco-editor-container');
        if (!container) {
            console.error('Monaco editor container not found - DOM element missing');
            this.showError('Monaco editor container not found in DOM');
            return;
        }

        console.log('Container found:', container);
        console.log('Container dimensions:', container.offsetWidth, 'x', container.offsetHeight);

        if (!window.monaco) {
            console.error('Monaco Editor not loaded - window.monaco is undefined');
            this.showError('Monaco Editor failed to load from CDN');
            return;
        }

        console.log('Monaco object available:', !!window.monaco);

        try {
            // Clear the welcome screen and ensure container is visible
            container.innerHTML = '';
            container.style.display = 'block';

            // Configure Perl language support
            this.configurePerlLanguage();

            this.editor = monaco.editor.create(container, {
                value: '', // Start with empty content
                language: 'perl',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 14,
                minimap: { enabled: true },
                wordWrap: 'on',
                lineNumbers: 'on',
                folding: true,
                bracketMatching: 'always',
                autoIndent: 'full',
                formatOnPaste: true,
                formatOnType: true,
                suggest: {
                    showKeywords: true,
                    showSnippets: true,
                    showFunctions: true,
                    showVariables: true,
                    showModules: true
                },
                // Enable clipboard operations
                copyWithSyntaxHighlighting: true,
                dragAndDrop: true,
                find: {
                    autoFindInSelection: 'never'
                },
                // Keyboard shortcuts
                multiCursorModifier: 'ctrlCmd',
                selectionHighlight: true,
                occurrencesHighlight: true,
                codeLens: false,
                contextmenu: true,
                mouseWheelZoom: true,
                // Ensure proper focus handling
                tabFocusMode: false,
                accessibilitySupport: 'off',
                // Hover configuration - fix popup positioning
                hover: {
                    enabled: true,
                    delay: 300,
                    sticky: true
                },
                // Fix overflow issues for popups
                fixedOverflowWidgets: true
            });

            console.log('Monaco Editor created successfully:', !!this.editor);

            // Set up completion providers
            this.setupCompletionProviders();

            // Track modifications and update error underline with debounce
            let syntaxCheckTimeout = null;
            this.editor.onDidChangeModelContent(() => {
                console.log('Content changed detected, activeTab:', this.activeTab);
                // Mark current tab as modified
                if (this.activeTab) {
                    const tabData = this.openTabs.get(this.activeTab);
                    console.log('Tab data found:', !!tabData);
                    if (tabData) {
                        const currentContent = this.editor.getValue();
                        const originalContent = tabData.originalContent;
                        tabData.content = currentContent;
                        tabData.modified = currentContent !== originalContent;
                        console.log('Content comparison - Current length:', currentContent.length, 'Original length:', originalContent.length, 'Modified:', tabData.modified);

                        // Update tab appearance - use more robust element selection
                        const allTabs = document.querySelectorAll('.editor-tab[data-file-path]');
                        let tabElement = null;
                        for (const tab of allTabs) {
                            if (tab.getAttribute('data-file-path') === this.activeTab) {
                                tabElement = tab;
                                break;
                            }
                        }
                        
                        if (tabElement) {
                            console.log('Updating tab appearance:', this.activeTab, 'modified:', tabData.modified);
                            if (tabData.modified) {
                                tabElement.classList.add('modified');
                            } else {
                                tabElement.classList.remove('modified');
                            }
                        } else {
                            console.log('Tab element not found for:', this.activeTab);
                        }
                    }
                }

                // Clear existing timeout
                if (syntaxCheckTimeout) {
                    clearTimeout(syntaxCheckTimeout);
                }

                // Set new timeout for syntax checking (600ms delay) - only for Perl files
                syntaxCheckTimeout = setTimeout(() => {
                    const code = this.editor.getValue();
                    
                    // Only check syntax for Perl files
                    if (this.activeTab && this.isPerlFile(this.activeTab)) {
                        this.checkPerlSyntax(code);
                    }
                }, 600);
            });

            // Update cursor position tracking
            this.editor.onDidChangeCursorPosition((e) => {
                this.updateCursorPosition(e.position.lineNumber, e.position.column);
            });

            // Update selection info tracking
            this.editor.onDidChangeCursorSelection((e) => {
                this.updateSelectionInfo();
            });

            // Add explicit clipboard support
            this.setupClipboardHandling();

            // Set up container resize observer for proper layout updates
            this.setupResizeObserver();

            // Show success message
            setTimeout(() => {
                console.log('Monaco Editor is fully functional!');
            }, 1000);

        } catch (error) {
            console.error('Error creating Monaco Editor:', error);
            this.showError('Failed to create Monaco Editor: ' + error.message);

            // Show fallback editor if Monaco fails
            container.innerHTML = `
                <div style="padding: 20px; color: #f44336; background: #1e1e1e; font-family: monospace;">
                    <h3>❌ Monaco Editor Failed</h3>
                    <p>Error: ${error.message}</p>
                </div>
                <textarea id="fallback-editor" style="
                    width: 100%; 
                    height: 300px; 
                    padding: 10px; 
                    color: #cccccc; 
                    background: #2d2d30;
                    border: 1px solid #444;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 14px;
                    resize: vertical;
                    outline: none;
                "># Monaco Editor failed to load
# Using fallback text editor

use strict;
use warnings;

print "Hello, World!";
</textarea>`;
        }
    }

    configurePerlLanguage() {
        // Define Perl language if not already defined
        if (!monaco.languages.getLanguages().find(lang => lang.id === 'perl')) {
            monaco.languages.register({ id: 'perl' });

            monaco.languages.setMonarchTokensProvider('perl', {
                tokenizer: {
                    root: [
                        [/#.*$/, 'comment'],
                        [/"([^"\\]|\\.)*$/, 'string.invalid'],
                        [/"/, 'string', '@string_double'],
                        [/'/, 'string', '@string_single'],
                        [/\$\w+/, 'variable'],
                        [/@\w+/, 'variable.array'],
                        [/%\w+/, 'variable.hash'],
                        [/&\w+/, 'variable.function'],
                        [/\b(sub|my|our|local|use|require|package|if|else|elsif|unless|while|for|foreach|do|until|next|last|redo|return|die|warn|print|printf|say)\b/, 'keyword'],
                        [/\b(strict|warnings|feature|Exporter|Carp|Data::Dumper|JSON|XML::Simple|DBI|CGI|LWP::UserAgent|File::Slurp|DateTime|Moose|Moo)\b/, 'type'],
                        [/\b\d+(\.\d+)?\b/, 'number'],
                        [/[{}()\[\]]/, 'bracket'],
                        [/[;,.]/, 'delimiter'],
                        [/[=!<>]+/, 'operator']
                    ],
                    string_double: [
                        [/[^\\"]+/, 'string'],
                        [/\\./, 'string.escape'],
                        [/"/, 'string', '@pop']
                    ],
                    string_single: [
                        [/[^\\']+/, 'string'],
                        [/\\./, 'string.escape'],
                        [/'/, 'string', '@pop']
                    ]
                }
            });
        }
    }

    setupFallbackEditor() {
        const textarea = document.getElementById('fallback-editor');
        if (!textarea) return;

        // Listen for file opened events
        document.addEventListener('file-opened', (event) => {
            const { filePath, content } = event.detail;
            textarea.value = content;
            this.currentFilePath = filePath;
            console.log(`Opened file in fallback editor: ${filePath}`);
        });

        // Auto-save functionality for fallback
        textarea.addEventListener('input', () => {
            if (this.currentFilePath) {
                clearTimeout(this.saveTimeout);
                this.saveTimeout = setTimeout(() => {
                    this.saveFallbackFile(textarea.value);
                }, 1000); // Save after 1 second of no typing
            }
        });
    }

    saveFallbackFile(content) {
        if (!this.currentFilePath) return;

        const fs = require('fs');
        try {
            fs.writeFileSync(this.currentFilePath, content, 'utf8');
            console.log(`Saved file via fallback editor: ${this.currentFilePath}`);
        } catch (error) {
            console.error('Failed to save file via fallback editor:', error);
            this.showError('Failed to save file: ' + error.message);
        }
    }

    setupCompletionProviders() {
        // Perl boilerplate completion provider
        const boilerplateProvider = monaco.languages.registerCompletionItemProvider('perl', {
            provideCompletionItems: function (model, position) {
                const textUntilPosition = model.getValueInRange({
                    startLineNumber: position.lineNumber,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                });
                if (/\bplb$/.test(textUntilPosition)) {
                    return {
                        suggestions: [
                            {
                                label: 'Perl Boilerplate',
                                kind: monaco.languages.CompletionItemKind.Snippet,
                                insertText: '#!/usr/bin/perl\nuse strict;\nuse warnings;\n\n',
                                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range: {
                                    startLineNumber: position.lineNumber,
                                    startColumn: position.column - 3, // length of 'plb'
                                    endLineNumber: position.lineNumber,
                                    endColumn: position.column
                                },
                                documentation: 'Insert Perl boilerplate: shebang, strict, warnings'
                            }
                        ]
                    };
                }
                return { suggestions: [] };
            }
        });

        // Variables completion provider (improved with better parsing)
        const variableProvider = monaco.languages.registerCompletionItemProvider('perl', {
            triggerCharacters: ['$', '@', '%'],
            provideCompletionItems: function (model, position) {
                const fullText = model.getValue();
                const suggestions = [];

                console.log('Variable completion provider triggered');

                // Get the text at current position to see what was typed
                const currentLine = model.getLineContent(position.lineNumber);
                const textBeforeCursor = currentLine.substring(0, position.column - 1);

                console.log('Current line:', currentLine);
                console.log('Text before cursor:', textBeforeCursor);

                // Check if we're typing a variable (starts with $, @, or %)
                const variableMatch = textBeforeCursor.match(/([$@%][\w]*)$/);
                if (variableMatch) {
                    const typedText = variableMatch[1];
                    const sigil = typedText[0]; // $, @, or %
                    const variableName = typedText.substring(1); // rest of the variable name

                    console.log('Typed text:', typedText, 'Sigil:', sigil, 'Variable name:', variableName);

                    // Find all variables with this sigil
                    // Look for both 'my' declarations and direct assignments
                    const patterns = [
                        new RegExp(`my\\s+(${sigil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\w]+)`, 'g'),
                        new RegExp(`(${sigil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\w]+)\\s*=`, 'g')
                    ];

                    patterns.forEach((pattern, index) => {
                        console.log(`Checking pattern ${index}:`, pattern);
                        let match;
                        while ((match = pattern.exec(fullText)) !== null) {
                            const fullVariableName = match[1];
                            const varNameWithoutSigil = fullVariableName.substring(1);

                            console.log('Found variable:', fullVariableName, 'without sigil:', varNameWithoutSigil);

                            // Only suggest if it matches what we're typing and avoid duplicates
                            if (varNameWithoutSigil.toLowerCase().startsWith(variableName.toLowerCase()) &&
                                !suggestions.find(s => s.label === fullVariableName)) {
                                suggestions.push({
                                    label: fullVariableName,
                                    kind: monaco.languages.CompletionItemKind.Variable,
                                    insertText: fullVariableName,
                                    documentation: `Variable (${sigil === '$' ? 'scalar' : sigil === '@' ? 'array' : 'hash'})`,
                                    sortText: '0' + fullVariableName.toLowerCase(), // High priority
                                    range: {
                                        startLineNumber: position.lineNumber,
                                        startColumn: position.column - typedText.length,
                                        endLineNumber: position.lineNumber,
                                        endColumn: position.column
                                    }
                                });
                            }
                        }
                    });

                    console.log('Found variable suggestions:', suggestions);
                } else {
                    console.log('No variable match found');
                }

                return { suggestions: suggestions };
            }
        });

        // Functions and keywords completion provider
        const functionProvider = monaco.languages.registerCompletionItemProvider('perl', {
            triggerCharacters: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
            provideCompletionItems: function (model, position) {
                const fullText = model.getValue();
                const suggestions = [];

                console.log('Function completion provider triggered');

                // Get the text at current position to see what was typed
                const currentLine = model.getLineContent(position.lineNumber);
                const textBeforeCursor = currentLine.substring(0, position.column - 1);

                console.log('Current line:', currentLine);
                console.log('Text before cursor:', textBeforeCursor);

                // Skip function completion if we're in a 'use' statement
                if (textBeforeCursor.match(/use\s+[a-zA-Z][\w:]*$/)) {
                    console.log('Inside use statement, skipping function completion');
                    return { suggestions: [] };
                }
                
                // Skip function completion if we're typing a variable (starts with $, @, or %)
                if (textBeforeCursor.match(/([$@%][\w]*)$/)) {
                    console.log('Typing a variable, skipping function completion');
                    return { suggestions: [] };
                }

                // Check if we're typing a function name (word starting with letter)
                const functionMatch = textBeforeCursor.match(/([a-zA-Z][\w]*)$/);
                if (functionMatch) {
                    const typedText = functionMatch[1];
                    console.log('Typed function text:', typedText);

                    // Add built-in Perl functions
                    const builtinFunctions = this.getBuiltinFunctions();
                    builtinFunctions.forEach(func => {
                        if (func.toLowerCase().startsWith(typedText.toLowerCase())) {
                            suggestions.push({
                                label: func,
                                kind: monaco.languages.CompletionItemKind.Function,
                                insertText: func + '(${1})',
                                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                documentation: `Built-in Perl function`,
                                detail: 'Built-in function',
                                sortText: '0' + func.toLowerCase(),
                                range: {
                                    startLineNumber: position.lineNumber,
                                    startColumn: position.column - typedText.length,
                                    endLineNumber: position.lineNumber,
                                    endColumn: position.column
                                }
                            });
                        }
                    });

                    // Add Perl keywords
                    const perlKeywords = this.getPerlKeywords();
                    perlKeywords.forEach(keyword => {
                        if (keyword.toLowerCase().startsWith(typedText.toLowerCase())) {
                            let insertText = keyword + ' ';
                            let insertTextRules = monaco.languages.CompletionItemInsertTextRule.None;

                            // Special handling for control flow keywords
                            if (['if', 'elsif', 'unless', 'while', 'until', 'for', 'foreach'].includes(keyword)) {
                                insertText = keyword + ' (${1:condition}) {\n\t${2}\n}';
                                insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
                            } else if (['sub'].includes(keyword)) {
                                insertText = keyword + ' ${1:function_name} {\n\t${2}\n}';
                                insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
                            } else if (['package'].includes(keyword)) {
                                insertText = keyword + ' ${1:Package::Name};';
                                insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
                            }

                            suggestions.push({
                                label: keyword,
                                kind: monaco.languages.CompletionItemKind.Keyword,
                                insertText: insertText,
                                insertTextRules: insertTextRules,
                                documentation: `Perl keyword`,
                                detail: 'Keyword',
                                sortText: '1' + keyword.toLowerCase(),
                                range: {
                                    startLineNumber: position.lineNumber,
                                    startColumn: position.column - typedText.length,
                                    endLineNumber: position.lineNumber,
                                    endColumn: position.column
                                }
                            });
                        }
                    });

                    // Add module-specific functions based on imported modules
                    const importedModules = this.getImportedModules(fullText);
                    console.log('Imported modules:', importedModules);

                    importedModules.forEach(module => {
                        const moduleFunctions = this.getModuleFunctions(module);
                        moduleFunctions.forEach(func => {
                            if (func.toLowerCase().startsWith(typedText.toLowerCase()) &&
                                !suggestions.find(s => s.label === func)) {
                                suggestions.push({
                                    label: func,
                                    kind: monaco.languages.CompletionItemKind.Function,
                                    insertText: func + '(${1})',
                                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation: `Function from ${module}`,
                                    detail: `From ${module}`,
                                    sortText: '0' + func.toLowerCase(), // High priority for module functions
                                    range: {
                                        startLineNumber: position.lineNumber,
                                        startColumn: position.column - typedText.length,
                                        endLineNumber: position.lineNumber,
                                        endColumn: position.column
                                    }
                                });
                            }
                        });
                    });

                    // Find all functions defined with 'sub'
                    const functionRegex = /sub\s+(\w+)/g;
                    let match;
                    while ((match = functionRegex.exec(fullText)) !== null) {
                        const functionName = match[1];
                        console.log('Found function:', functionName);

                        // Only suggest if it matches what we're typing and avoid duplicates
                        if (functionName.toLowerCase().startsWith(typedText.toLowerCase()) &&
                            !suggestions.find(s => s.label === functionName)) {
                            suggestions.push({
                                label: functionName,
                                kind: monaco.languages.CompletionItemKind.Function,
                                insertText: functionName + '(${1})',
                                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                documentation: `Function defined with 'sub'`,
                                detail: 'User-defined function',
                                sortText: '2' + functionName.toLowerCase(),
                                range: {
                                    startLineNumber: position.lineNumber,
                                    startColumn: position.column - typedText.length,
                                    endLineNumber: position.lineNumber,
                                    endColumn: position.column
                                }
                            });
                        }
                    }

                    console.log('Found function suggestions:', suggestions);
                } else {
                    console.log('No function match found');
                }

                return { suggestions: suggestions };
            }.bind(this)
        });

        // Modules completion provider (improved)
        const moduleProvider = monaco.languages.registerCompletionItemProvider('perl', {
            triggerCharacters: [' ', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', ':'],
            provideCompletionItems: async (model, position) => {
                const suggestions = [];

                // Get the text at current position to see what was typed
                const currentLine = model.getLineContent(position.lineNumber);
                const textBeforeCursor = currentLine.substring(0, position.column - 1);

                console.log('Module completion triggered. Text before cursor:', textBeforeCursor);

                // Only trigger for 'use' statements
                const useStatementMatch = textBeforeCursor.match(/use\s*([a-zA-Z][\w:]*)$/);
                const useOnlyMatch = textBeforeCursor.match(/use\s*$/);

                if (!useStatementMatch && !useOnlyMatch) {
                    console.log('Not in use statement, skipping module completion');
                    return { suggestions: [] };
                }

                // Get available modules (with fallback)
                const availableModules = this.getAvailableModules();
                console.log('Available modules count:', availableModules.length);

                // Check if we're typing 'use ' (just after space)
                if (useOnlyMatch) {
                    console.log('Use statement detected');

                    // Show first 10 modules
                    const moduleNames = availableModules.slice(0, 10);
                    moduleNames.forEach(module => {
                        suggestions.push({
                            label: module,
                            kind: monaco.languages.CompletionItemKind.Module,
                            insertText: module + ';',
                            documentation: `Perl module: ${module}`,
                            sortText: '0' + module.toLowerCase(), // High priority
                            range: {
                                startLineNumber: position.lineNumber,
                                startColumn: position.column,
                                endLineNumber: position.lineNumber,
                                endColumn: position.column
                            }
                        });
                    });

                    console.log('Initial module suggestions:', suggestions);
                    return { suggestions: suggestions };
                }

                // Check if we're typing after 'use ' (e.g., 'use s', 'use st', etc.)
                if (useStatementMatch) {
                    const modulePrefix = useStatementMatch[1];

                    console.log('Module prefix detected:', modulePrefix);

                    // Filter modules that match the current prefix
                    const matchingModules = availableModules.filter(module =>
                        module.toLowerCase().startsWith(modulePrefix.toLowerCase())
                    );

                    matchingModules.forEach(module => {
                        suggestions.push({
                            label: module,
                            kind: monaco.languages.CompletionItemKind.Module,
                            insertText: module + ';',
                            documentation: `Perl module: ${module}`,
                            sortText: '0' + module.toLowerCase(), // High priority
                            range: {
                                startLineNumber: position.lineNumber,
                                startColumn: position.column - modulePrefix.length,
                                endLineNumber: position.lineNumber,
                                endColumn: position.column
                            }
                        });
                    });

                    console.log('Filtered module suggestions:', suggestions.length, 'for prefix:', modulePrefix);
                }

                return { suggestions: suggestions };
            }
        });

        // Store completion providers for cleanup (register in priority order: variables first, then modules, etc.)
        this.completionProviders.push(variableProvider, moduleProvider, boilerplateProvider, functionProvider);
    }

    setupEventListeners() {
        // Save shortcut (Ctrl+S and Ctrl+Shift+S)
        document.addEventListener('keydown', (e) => {
            // Use code instead of key for more reliable detection
            if (e.ctrlKey && e.code === 'KeyS') {
                e.preventDefault();
                if (e.shiftKey) {
                    // Ctrl+Shift+S: Save As
                    this.saveAsFile();
                } else {
                    // Ctrl+S: Save
                    this.saveFile();
                }
            }
            
            // Close tab shortcut (Ctrl+W)
            if (e.ctrlKey && e.key === 'w') {
                e.preventDefault();
                if (this.activeTab) {
                    this.closeTab(this.activeTab);
                }
            }
            
            // Switch tabs (Ctrl+Tab / Ctrl+Shift+Tab)
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault();
                const tabs = Array.from(this.openTabs.keys());
                if (tabs.length > 1) {
                    const currentIndex = tabs.indexOf(this.activeTab);
                    let nextIndex;
                    if (e.shiftKey) {
                        nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
                    } else {
                        nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
                    }
                    this.switchToTab(tabs[nextIndex]);
                }
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (this.editor) {
                this.editor.layout();
            }
        });
    }

    setupClipboardHandling() {
        if (!this.editor) return;

        const container = document.getElementById('monaco-editor-container');
        if (!container) return;

        console.log('Setting up clipboard handling for Monaco Editor');

        // Ensure the editor container can receive focus
        container.setAttribute('tabindex', '0');
        
        // Add keyboard event listeners for clipboard operations
        container.addEventListener('keydown', (e) => {
            // Handle Ctrl+V (paste)
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                console.log('Paste detected via keyboard');
                e.preventDefault();
                this.handlePaste();
                return;
            }
            
            // Handle Ctrl+C (copy)
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                console.log('Copy detected via keyboard');
                this.handleCopy();
                return;
            }
            
            // Handle Ctrl+X (cut)
            if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                console.log('Cut detected via keyboard');
                this.handleCut();
                return;
            }
        });

        // Add context menu paste handling
        container.addEventListener('paste', (e) => {
            console.log('Paste event detected');
            e.preventDefault();
            this.handlePasteEvent(e);
        });

        // Make sure the editor gets focus when clicked
        container.addEventListener('mousedown', () => {
            if (this.editor) {
                this.editor.focus();
            }
        });
    }

    async handlePaste() {
        try {
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText && this.editor) {
                const selection = this.editor.getSelection();
                const id = { major: 1, minor: 1 };
                const op = { identifier: id, range: selection, text: clipboardText, forceMoveMarkers: true };
                this.editor.executeEdits('paste', [op]);
                console.log('Pasted text from clipboard:', clipboardText.substring(0, 50) + '...');
            }
        } catch (error) {
            console.warn('Failed to read from clipboard:', error);
            // Fallback: try to trigger Monaco's built-in paste
            if (this.editor) {
                this.editor.trigger('keyboard', 'paste', null);
            }
        }
    }

    handlePasteEvent(e) {
        const clipboardData = e.clipboardData || window.clipboardData;
        if (clipboardData && this.editor) {
            const text = clipboardData.getData('text');
            if (text) {
                const selection = this.editor.getSelection();
                const id = { major: 1, minor: 1 };
                const op = { identifier: id, range: selection, text: text, forceMoveMarkers: true };
                this.editor.executeEdits('paste', [op]);
                console.log('Pasted text from event:', text.substring(0, 50) + '...');
            }
        }
    }

    handleCopy() {
        if (this.editor) {
            const selection = this.editor.getSelection();
            if (!selection.isEmpty()) {
                const text = this.editor.getModel().getValueInRange(selection);
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(() => {
                        console.log('Copied text to clipboard:', text.substring(0, 50) + '...');
                    }).catch(err => {
                        console.warn('Failed to copy to clipboard:', err);
                    });
                }
            }
        }
    }

    handleCut() {
        if (this.editor) {
            const selection = this.editor.getSelection();
            if (!selection.isEmpty()) {
                const text = this.editor.getModel().getValueInRange(selection);
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(() => {
                        console.log('Cut text to clipboard:', text.substring(0, 50) + '...');
                        // Delete the selected text
                        const id = { major: 1, minor: 1 };
                        const op = { identifier: id, range: selection, text: '', forceMoveMarkers: true };
                        this.editor.executeEdits('cut', [op]);
                    }).catch(err => {
                        console.warn('Failed to cut to clipboard:', err);
                    });
                }
            }
        }
    }

    setupResizeObserver() {
        const container = document.getElementById('monaco-editor-container');
        if (!container || !this.editor) {
            return;
        }

        // Use ResizeObserver to detect container size changes
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                if (this.editor) {
                    // Force Monaco to recalculate its layout
                    setTimeout(() => {
                        this.editor.layout();
                    }, 10);
                }
            });

            this.resizeObserver.observe(container);
            console.log('ResizeObserver set up for Monaco Editor');
        } else {
            // Fallback for browsers without ResizeObserver
            console.log('ResizeObserver not available, using fallback');
            this.setupFallbackResize();
        }
    }

    setupFallbackResize() {
        // Fallback resize detection using polling
        let lastWidth = 0;
        let lastHeight = 0;

        const checkResize = () => {
            const container = document.getElementById('monaco-editor-container');
            if (container && this.editor) {
                const currentWidth = container.offsetWidth;
                const currentHeight = container.offsetHeight;

                if (currentWidth !== lastWidth || currentHeight !== lastHeight) {
                    this.editor.layout();
                    lastWidth = currentWidth;
                    lastHeight = currentHeight;
                    console.log(`Monaco layout updated: ${currentWidth}x${currentHeight}`);
                }
            }
        };

        // Check more frequently for better responsiveness
        this.resizeCheckInterval = setInterval(checkResize, 50);
    }

    openFile(filePath, content, language = null) {
        if (!this.editor) {
            console.error('Monaco editor not initialized');
            return;
        }

        this.currentFilePath = filePath;

        // Detect language based on file extension using helper function
        if (!language) {
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
            language = this.getLanguageFromFileName(fileName);
        }

        // Set editor content and language
        this.editor.setValue(content);
        monaco.editor.setModelLanguage(this.editor.getModel(), language);

        console.log(`Opened file: ${filePath} (${language})`);
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 50px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 12px;
            border-radius: 4px;
            z-index: 9999;
            max-width: 300px;
        `;

        document.body.appendChild(errorDiv);

        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    // Public methods for external use
    getCurrentContent() {
        return this.editor ? this.editor.getValue() : '';
    }

    setContent(content) {
        if (this.editor) {
            this.editor.setValue(content);
        }
    }

    getCurrentFilePath() {
        return this.currentFilePath;
    }

    // Get available Perl modules (from loaded modules.json or fallback list)
    getAvailableModules() {
        // If we have loaded modules from modules.json, use those
        if (this.modules && this.modules.modules && Array.isArray(this.modules.modules)) {
            return this.modules.modules;
        }

        // Fallback to common Perl modules
        return [
            // Core modules
            'strict', 'warnings', 'utf8', 'feature', 'lib', 'vars', 'base', 'parent',

            // Data handling
            'Data::Dumper', 'Data::Printer', 'Storable', 'JSON', 'JSON::PP', 'JSON::XS',
            'YAML', 'YAML::Tiny', 'XML::Simple', 'XML::LibXML', 'XML::Twig',

            // File and I/O
            'File::Path', 'File::Copy', 'File::Find', 'File::Basename', 'File::Spec',
            'File::Temp', 'File::Slurp', 'Path::Tiny', 'IO::File', 'IO::Handle',

            // Text processing
            'Text::CSV', 'Text::CSV_XS', 'Regexp::Common', 'String::Util',

            // Web and networking
            'LWP::Simple', 'LWP::UserAgent', 'HTTP::Request', 'HTTP::Response',
            'URI', 'URI::Escape', 'Net::FTP', 'Net::SMTP', 'WWW::Mechanize',

            // Database
            'DBI', 'DBD::SQLite', 'DBD::mysql', 'DBD::Pg', 'DBD::Oracle',

            // Date and time
            'DateTime', 'DateTime::Format::Strptime', 'Time::Piece', 'Time::HiRes',
            'Time::Local', 'Date::Parse', 'Date::Manip',

            // Object-oriented frameworks
            'Moose', 'Moo', 'Mouse', 'Class::Accessor', 'Object::Tiny',

            // Utility modules
            'List::Util', 'List::MoreUtils', 'Scalar::Util', 'Hash::Util',
            'Getopt::Long', 'Pod::Usage', 'Carp', 'Try::Tiny', 'autodie',

            // Testing
            'Test::More', 'Test::Simple', 'Test::Exception', 'Test::Deep',

            // Logging
            'Log::Log4perl', 'Log::Dispatch', 'Log::Any',

            // Templating
            'Template', 'HTML::Template', 'Text::Template',

            // Encryption and security
            'Digest::MD5', 'Digest::SHA', 'Crypt::CBC', 'MIME::Base64',

            // Archive and compression
            'Archive::Zip', 'Archive::Tar', 'Compress::Zlib', 'IO::Compress::Gzip',

            // Configuration
            'Config::Simple', 'Config::Tiny', 'AppConfig',

            // Email
            'Email::Simple', 'Email::MIME', 'Mail::Send', 'MIME::Lite',

            // System
            'Sys::Hostname', 'Sys::Syslog', 'File::Which', 'Proc::ProcessTable',

            // Modern Perl
            'Modern::Perl', 'Perl6::Say', 'Switch'
        ];
    }

    // Helper function to extract imported modules from code
    getImportedModules(code) {
        const modules = [];
        const lines = code.split('\n');

        lines.forEach(line => {
            // Match 'use Module::Name;' or 'use Module::Name qw(...);'
            const useMatch = line.match(/use\s+([A-Za-z][A-Za-z0-9_:]*)/);
            if (useMatch) {
                const moduleName = useMatch[1];
                // Skip common pragmas that don't add functions
                if (!['strict', 'warnings', 'vars', 'base', 'parent', 'utf8', 'feature'].includes(moduleName)) {
                    modules.push(moduleName);
                }
            }
        });

        console.log('Imported modules found:', modules);
        return modules;
    }

    // Helper function to get functions from specific modules using loaded modules.json
    getModuleFunctions(moduleName) {
        // First try to get from loaded modules.json
        if (this.modules && this.modules.moduleFunctions && this.modules.moduleFunctions[moduleName]) {
            console.log(`Found ${this.modules.moduleFunctions[moduleName].length} functions for ${moduleName}`);
            return this.modules.moduleFunctions[moduleName];
        }

        // Fallback to empty array if not found
        console.log(`No functions found for module: ${moduleName}`);
        return [];
    }

    // Helper function to get built-in Perl functions
    getBuiltinFunctions() {
        return [
            // String functions
            'length', 'substr', 'index', 'rindex', 'uc', 'lc', 'ucfirst', 'lcfirst',
            'chomp', 'chop', 'reverse', 'split', 'join', 'sprintf', 'printf',
            'ord', 'chr', 'hex', 'oct', 'binmode', 'crypt', 'quotemeta',

            // Array functions
            'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse',
            'grep', 'map', 'each', 'keys', 'values', 'exists', 'delete',

            // Hash functions
            'keys', 'values', 'each', 'exists', 'delete', 'defined',

            // File and I/O functions
            'open', 'close', 'read', 'write', 'seek', 'tell', 'truncate',
            'rename', 'unlink', 'mkdir', 'rmdir', 'chdir', 'chmod', 'chown',
            'stat', 'lstat', 'link', 'symlink', 'readlink', 'glob',
            'opendir', 'readdir', 'closedir', 'rewinddir', 'telldir', 'seekdir',

            // Process and system functions
            'system', 'exec', 'fork', 'wait', 'waitpid', 'kill', 'alarm',
            'sleep', 'time', 'times', 'getpgrp', 'setpgrp', 'getppid',
            'getpriority', 'setpriority', 'getpwnam', 'getpwuid', 'getgrnam', 'getgrgid',

            // Math functions
            'abs', 'atan2', 'cos', 'exp', 'int', 'log', 'rand',
            'sin', 'sqrt', 'srand', 'atan', 'sinh', 'cosh', 'tanh',

            // Regular expression functions that are actually functions (not operators)
            'quotemeta',

            // Print functions
            'print', 'printf', 'say',

            // Error handling functions
            'die', 'warn', 'croak', 'confess', 'cluck', 'carp',

            // Other utility functions (excluding keywords)
            'eval', 'caller', 'wantarray', 'scalar', 'ref', 'bless',
            'tie', 'untie', 'tied', 'format', 'write', 'defined', 'undef',
            'select', 'eof', 'fileno', 'getc', 'readline', 'readpipe',
            'pipe', 'socketpair', 'shmget', 'shmread', 'shmwrite', 'shmctl',
            'msgget', 'msgrcv', 'msgsnd', 'msgctl', 'semget', 'semop', 'semctl',
            'flock', 'fcntl', 'ioctl', 'syscall', 'sysopen', 'sysread', 'syswrite',
            'sysseek', 'sysclose',
            'getpeername', 'getsockname', 'getsockopt', 'setsockopt', 'socket',
            'socketpair', 'bind', 'listen', 'accept', 'connect', 'shutdown',
            'recv', 'send', 'recvfrom', 'sendto', 'gethostbyname', 'gethostbyaddr',
            'getnetbyname', 'getnetbyaddr', 'getservbyname', 'getservbyport',
            'gethostent', 'getnetent', 'getservent', 'sethostent', 'setnetent',
            'setservent', 'endhostent', 'endnetent', 'endservent', 'getprotoent',
            'getprotobyname', 'getprotobynumber', 'setprotoent', 'endprotoent',
            'getpwent', 'setpwent', 'endpwent', 'getgrent', 'setgrent', 'endgrent'
        ];
    }

    // Helper function to get Perl keywords
    getPerlKeywords() {
        return [
            // Control flow keywords
            'if', 'elsif', 'else', 'unless', 'while', 'until', 'for', 'foreach',
            'do', 'given', 'when', 'default', 'continue', 'last', 'next', 'redo',
            'goto', 'return', 'exit', 'die', 'warn',

            // Variable declaration keywords
            'my', 'our', 'local', 'state', 'package', 'sub', 'use', 'no',
            'require', 'import', 'unimport',

            // Object-oriented keywords
            'bless', 'ref', 'isa', 'can', 'VERSION', 'SUPER', 'parent', 'base',

            // File and I/O keywords
            'open', 'close', 'read', 'write', 'seek', 'tell', 'truncate',
            'rename', 'unlink', 'mkdir', 'rmdir', 'chdir', 'chmod', 'chown',
            'stat', 'lstat', 'link', 'symlink', 'readlink', 'glob',
            'opendir', 'readdir', 'closedir', 'rewinddir', 'telldir', 'seekdir',

            // Process and system keywords
            'system', 'exec', 'fork', 'wait', 'waitpid', 'kill', 'alarm',
            'sleep', 'time', 'times', 'getpgrp', 'setpgrp', 'getppid',
            'getpriority', 'setpriority',

            // Regular expression keywords
            'm', 's', 'tr', 'y', 'qr', 'split', 'join', 'grep', 'map',

            // Other keywords
            'defined', 'undef', 'scalar', 'wantarray', 'caller', 'eval',
            'do', 'format', 'select', 'eof', 'fileno', 'getc', 'readline',
            'readpipe', 'pipe', 'socketpair', 'flock', 'fcntl', 'ioctl',
            'syscall', 'sysopen', 'sysread', 'syswrite', 'sysseek', 'sysclose',
            'getpeername', 'getsockname', 'getsockopt', 'setsockopt', 'socket',
            'bind', 'listen', 'accept', 'connect', 'shutdown', 'recv', 'send',
            'recvfrom', 'sendto', 'gethostbyname', 'gethostbyaddr', 'getnetbyname',
            'getnetbyaddr', 'getservbyname', 'getservbyport', 'gethostent',
            'getnetent', 'getservent', 'sethostent', 'setnetent', 'setservent',
            'endhostent', 'endnetent', 'endservent', 'getprotoent', 'getprotobyname',
            'getprotobynumber', 'setprotoent', 'endprotoent', 'getpwent', 'setpwent',
            'endpwent', 'getgrent', 'setgrent', 'endgrent'
        ];
    }

    // Perl syntax checking function
    async checkPerlSyntax(code) {
        try {
            // Show loading indicator
            this.updateStatusMessage('Checking syntax...', '#007acc');

            // Call the backend to check Perl syntax via IPC
            const result = await window.electronAPI.checkPerlSyntax(code);
            console.log('Perl syntax check result:', result);

            // Clear previous markers
            const model = this.editor.getModel();
            monaco.editor.setModelMarkers(model, 'perl', []);

            // Initialize counters
            let errorCount = 0;
            let warningCount = 0;

            if (result.success) {
                // Check if there are warnings in the output
                const hasWarnings = result.output.includes('Unquoted string') ||
                    result.output.includes('Name "main::') ||
                    result.output.includes('Use of uninitialized value') ||
                    result.output.includes('Scalar value') ||
                    result.output.includes('Possible precedence problem');

                if (hasWarnings) {
                    console.log('⚠️ Syntax OK but with warnings');
                    // Parse warnings from output
                    const warnings = this.parseWarningsFromOutput(result.output, code);
                    warningCount = warnings.length;
                    const markers = warnings.map(warning => ({
                        severity: monaco.MarkerSeverity.Warning,
                        message: warning.message,
                        startLineNumber: warning.line,
                        endLineNumber: warning.line,
                        startColumn: 1,
                        endColumn: 100
                    }));
                    monaco.editor.setModelMarkers(model, 'perl', markers);
                } else {
                    console.log('✅ Syntax OK:', result.message);
                }
            } else {
                console.log('❌ Perl syntax errors/warnings:');
                const markers = [];
                result.errors.forEach(error => {
                    console.log(`Line ${error.line}: ${error.message} (${error.severity})`);
                    if (error.near) {
                        console.log(`  Near: "${error.near}"`);
                    }

                    // Count errors and warnings
                    if (error.severity === 'error') {
                        errorCount++;
                    } else if (error.severity === 'warning') {
                        warningCount++;
                    }

                    // Create marker for this error
                    markers.push({
                        severity: error.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
                        message: error.message,
                        startLineNumber: error.line,
                        endLineNumber: error.line,
                        startColumn: 1,
                        endColumn: 100
                    });
                });
                monaco.editor.setModelMarkers(model, 'perl', markers);
            }

            // Update error and warning counters in status bar
            this.updateErrorWarningCounts(errorCount, warningCount);

            // Clear loading indicator
            this.updateStatusMessage('');
        } catch (err) {
            console.error('Error checking Perl syntax:', err);
            this.updateStatusMessage('Error checking syntax', '#f44336');
        }
    }

    // Parse warnings from Perl output
    parseWarningsFromOutput(output, code) {
        const warnings = [];
        const lines = output.split('\n');

        lines.forEach(line => {
            // Match warning patterns
            if (line.includes('Unquoted string') ||
                line.includes('Name "main::') ||
                line.includes('Use of uninitialized value') ||
                line.includes('Scalar value') ||
                line.includes('Possible precedence problem')) {

                // Try to extract line number from the warning
                const lineMatch = line.match(/line (\d+)/);
                if (lineMatch) {
                    const lineNum = parseInt(lineMatch[1]);
                    
                    // Check if original code already has any form of warnings directive
                    const hasWarningsDirective = /use\s+warnings?\s*;/i.test(code);
                    const lineOffset = hasWarningsDirective ? 0 : 1;
                    
                    // Adjust the line number based on whether warnings were added
                    const adjustedLine = lineNum - lineOffset;

                    warnings.push({
                        line: Math.max(1, adjustedLine),
                        message: line.trim()
                    });

                    console.log(`Warning at line ${adjustedLine}: ${line.trim()}`);
                }
            }
        });

        return warnings;
    }

    // Update cursor position in status bar
    updateCursorPosition(line, column) {
        // Update breadcrumb cursor position
        this.updateBreadcrumbCursor(line, column);
        
        // Try to find cursor position element in the current layout
        const cursorElement = document.querySelector('.cursor-position') ||
            document.querySelector('#cursorPosition') ||
            document.querySelector('[data-cursor]');
        if (cursorElement) {
            cursorElement.textContent = `Ln ${line}, Col ${column}`;
        } else {
            console.log(`Cursor position: Ln ${line}, Col ${column}`);
        }
    }

    // Update breadcrumb with current file path and cursor position
    updateBreadcrumbCursor(line, column) {
        const breadcrumbCursor = document.getElementById('breadcrumb-cursor');
        if (breadcrumbCursor) {
            breadcrumbCursor.textContent = `Ln ${line}, Col ${column}`;
        }
    }

    // Update breadcrumb with file path
    updateBreadcrumbPath(filePath, fileName) {
        const breadcrumbPath = document.getElementById('breadcrumb-path');
        if (breadcrumbPath) {
            if (filePath && fileName) {
                // Extract directory path
                const directory = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
                const displayPath = directory ? `${directory}/${fileName}` : fileName;
                
                // Get file icon based on extension
                const ext = fileName.split('.').pop().toLowerCase();
                let icon = '📄';
                switch (ext) {
                    case 'pl':
                    case 'pm':
                    case 'perl':
                        icon = '🔷';
                        break;
                    case 'js':
                    case 'jsx':
                        icon = '📜';
                        break;
                    case 'json':
                        icon = '📋';
                        break;
                    case 'html':
                    case 'htm':
                        icon = '🌐';
                        break;
                    case 'css':
                        icon = '🎨';
                        break;
                    case 'md':
                    case 'markdown':
                        icon = '📝';
                        break;
                    case 'py':
                        icon = '🐍';
                        break;
                    case 'txt':
                        icon = '📝';
                        break;
                }
                
                breadcrumbPath.innerHTML = `<span style="margin-right: 4px; opacity: 0.7;">${icon}</span>${displayPath}`;
            } else {
                breadcrumbPath.innerHTML = `<span style="margin-right: 4px; opacity: 0.7;">🏠</span>Welcome`;
            }
        }
    }

    // Update selection info in status bar
    updateSelectionInfo() {
        if (!this.editor) return;

        const selection = this.editor.getSelection();
        const selectionElement = document.querySelector('.selection-info') ||
            document.querySelector('#selectionInfo') ||
            document.querySelector('[data-selection]');

        if (selectionElement) {
            if (selection.isEmpty()) {
                selectionElement.textContent = '';
            } else {
                const selectedText = this.editor.getModel().getValueInRange(selection);
                const lines = selectedText.split('\n').length;
                const chars = selectedText.length;
                selectionElement.textContent = `(${lines} lines, ${chars} chars selected)`;
            }
        }
    }

    // Update error and warning counts in status bar
    updateErrorWarningCounts(errorCount, warningCount) {
        // Try to find error count elements
        const errorElement = document.querySelector('.error-count') ||
            document.querySelector('#errorCount') ||
            document.querySelector('[data-errors]');
        const warningElement = document.querySelector('.warning-count') ||
            document.querySelector('#warningCount') ||
            document.querySelector('[data-warnings]');

        if (errorElement) {
            const errorSpan = errorElement.querySelector('span') || errorElement;
            errorSpan.textContent = errorCount.toString();
        } else {
            console.log(`Errors: ${errorCount}`);
        }

        if (warningElement) {
            const warningSpan = warningElement.querySelector('span') || warningElement;
            warningSpan.textContent = warningCount.toString();
        } else {
            console.log(`Warnings: ${warningCount}`);
        }
    }

    // Update status message
    updateStatusMessage(message, color = '#cccccc') {
        const statusElement = document.querySelector('.status-message') ||
            document.querySelector('#statusBar') ||
            document.querySelector('[data-status]');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.style.color = color;
        } else {
            console.log(`Status: ${message}`);
        }
    }

    dispose() {
        if (this.editor) {
            this.editor.dispose();
        }
        this.completionProviders.forEach(provider => provider.dispose());

        // Clean up resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        // Clean up fallback resize interval
        if (this.resizeCheckInterval) {
            clearInterval(this.resizeCheckInterval);
        }
    }
}

// Initialize Monaco Editor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Monaco Editor...');

    // Check if container exists
    const container = document.getElementById('monaco-editor-container');
    if (!container) {
        console.error('Monaco container not found during initialization');
        return;
    }

    console.log('Container found, dimensions:', container.offsetWidth, 'x', container.offsetHeight);

    // Force visibility on all parent elements (we know this works from the test)
    let parent = container;
    while (parent && parent !== document.body) {
        parent.style.display = 'flex';
        parent.style.visibility = 'visible';
        parent.style.opacity = '1';
        if (parent.classList.contains('code-area')) {
            // Don't set fixed heights - let CSS flexbox handle it
        }
        if (parent.classList.contains('editor-content')) {
            // Don't set fixed heights - let CSS flexbox handle it
            parent.style.flex = '1';
        }
        parent = parent.parentElement;
    }

    // Show immediate content while Monaco loads
    container.innerHTML = `
        <div id="loading-editor" style="
            width: 100%; 
            height: 100%; 
            min-height: 35px;
            padding: 20px; 
            color: #cccccc; 
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            background: #1e1e1e;
            border: 1px solid #007acc;
            box-sizing: border-box;
            white-space: pre-wrap;
            overflow: auto;
            display: block;
        ">🔄 Loading Monaco Editor...

# Welcome to the Conceptual Map Editor
# Monaco Editor is initializing...
# 
# Supported file types:
# - .pl, .pm (Perl files) with syntax highlighting
# - .py (Python files) with syntax highlighting
# - .json (JSON files) with syntax highlighting  
# - .md (Markdown files) with syntax highlighting
#
# Click on a file in the explorer to start editing

use strict;
use warnings;

print "Hello, World!";  # Perl example

# Monaco Editor loading...</div>`;

    // Force the container to be visible
    container.style.display = 'block';
    container.style.visibility = 'visible';
    container.style.height = '100%';
    // Remove fixed min-height to allow proper resizing

    // Try to initialize Monaco Editor after a small delay
    setTimeout(() => {
        try {
            window.monacoEditor = new MonacoEditor();
        } catch (error) {
            console.error('Failed to initialize Monaco Editor:', error);
            // Show fallback editor if Monaco fails
            container.innerHTML = `
                <div style="
                    width: 100%; 
                    height: 100%; 
                    min-height: 35px;
                    padding: 20px; 
                    color: #cccccc; 
                    background: #1e1e1e;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 14px;
                    border: 1px solid #f44336;
                    box-sizing: border-box;
                    display: block;
                ">❌ Monaco Editor failed to load

Error: ${error.message}

# Fallback Text Editor
# You can still click on files to edit them

use strict;
use warnings;

print "Monaco failed to load, but this fallback works!\\n";

# Click on a .pl file in the explorer to open it here</div>
                <textarea id="fallback-textarea" style="
                    width: 100%; 
                    height: 300px; 
                    margin-top: 10px;
                    padding: 10px; 
                    color: #cccccc; 
                    background: #2d2d30;
                    border: 1px solid #444;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 14px;
                    resize: vertical;
                    outline: none;
                " placeholder="Type your code here..."># Fallback editor - type your code here
use strict;
use warnings;

print "Hello World!\\n";
</textarea>`;
        }
    }, 100);
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MonacoEditor;
}
