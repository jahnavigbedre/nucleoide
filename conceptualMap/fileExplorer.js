const { ipcRenderer } = require('electron');
const path = require('path');
const chokidar = require('chokidar');
const fs = require('fs');

class ConceptualMapFileExplorer {
    constructor() {
        this.currentPath = '';
        this.selectedItem = null;
        this.selectedItems = new Set();
        this.lastSelectedItem = null;
        this.draggedItem = null;
        this.clipboard = null;
        this.watcher = null;
        this.contextMenuTarget = null; // Track the folder where context menu was opened
        this.fileTree = document.getElementById('cm-file-tree');
        this.contextMenu = document.getElementById('cm-context-menu');
        this.currentPathElement = document.getElementById('cm-current-path');

        // Input dialog elements
        this.inputDialogOverlay = document.getElementById('cm-input-dialog-overlay');
        this.inputDialogTitle = document.getElementById('cm-input-dialog-title');
        this.inputDialogInput = document.getElementById('cm-input-dialog-input');
        this.inputDialogOk = document.getElementById('cm-input-dialog-ok');
        this.inputDialogCancel = document.getElementById('cm-input-dialog-cancel');

        this.init();
    }

    async init() {
        await this.setupInitialPath();
        this.setupEventListeners();
        await this.loadFileTree();
        this.setupFileWatcher();
        this.updateCurrentPath();
    }

    async setupInitialPath() {
        this.currentPath = await ipcRenderer.invoke('get-home-directory');
        // Save the initial directory to cache to ensure it's persisted
        await ipcRenderer.invoke('save-current-directory', this.currentPath);
        console.log('Initial directory loaded from cache:', this.currentPath);
    }

    setupEventListeners() {
        // Action buttons
        document.getElementById('cm-new-file-btn').addEventListener('click', () => {
            this.hideContextMenu();
            this.createNewFileInActiveFolder();
        });
        document.getElementById('cm-new-folder-btn').addEventListener('click', () => {
            this.hideContextMenu();
            this.createNewFolderInActiveFolder();
        });
        document.getElementById('cm-refresh-btn').addEventListener('click', () => {
            this.hideContextMenu();
            this.refreshFileTree();
        });
        document.getElementById('cm-open-folder-btn').addEventListener('click', () => {
            this.hideContextMenu();
            this.openFolderDialog();
        });

        // Context menu - hide when clicking outside
        document.addEventListener('click', (e) => this.handleGlobalContextMenuClick(e));
        document.addEventListener('contextmenu', (e) => {
            // Hide context menu when right-clicking elsewhere
            if (!this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });
        this.contextMenu.addEventListener('click', (e) => {
            // Prevent context menu from closing when clicking on menu items
            e.stopPropagation();
            this.handleContextMenuAction(e);
        });

        // File tree right-click for empty space
        this.fileTree.addEventListener('contextmenu', (e) => this.handleEmptySpaceContextMenu(e));

        // File tree left-click for empty space (deselect)
        this.fileTree.addEventListener('click', (e) => this.handleFileTreeClick(e));

        // Input dialog
        this.inputDialogOk.addEventListener('click', () => this.confirmInputDialog());
        this.inputDialogCancel.addEventListener('click', () => this.cancelInputDialog());
        this.inputDialogInput.addEventListener('keydown', (e) => this.handleInputDialogKeydown(e));

        // Ensure input is focusable when clicked
        this.inputDialogInput.addEventListener('click', () => {
            this.inputDialogInput.focus();
        });

        // Focus input when clicking anywhere in the dialog
        this.inputDialogOverlay.addEventListener('click', (e) => {
            // Only focus if clicking on the overlay itself, not the dialog content
            if (e.target === this.inputDialogOverlay) {
                this.inputDialogInput.focus();
                this.inputDialogInput.select();
            }
        });

        // Ensure dialog content clicks don't close the dialog
        const inputDialogContent = document.querySelector('.cm-input-dialog');
        if (inputDialogContent) {
            inputDialogContent.addEventListener('click', (e) => {
                e.stopPropagation();
                this.inputDialogInput.focus();
                this.inputDialogInput.select();
            });

            // Also handle mousedown for immediate focus
            inputDialogContent.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                // Small delay to ensure the click event completes
                setTimeout(() => {
                    this.inputDialogInput.focus();
                    this.inputDialogInput.select();
                }, 1);
            });
        }

        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Click outside explorer to deselect
        document.addEventListener('click', (e) => this.handleGlobalClick(e));

        // Root drop support - enable dropping on empty areas of the file tree
        this.fileTree.addEventListener('dragover', (e) => this.handleRootDragOver(e));
        this.fileTree.addEventListener('drop', (e) => this.handleRootDrop(e));
        this.fileTree.addEventListener('dragleave', (e) => this.handleRootDragLeave(e));
    }

    setupFileWatcher() {
        if (this.watcher) {
            this.watcher.close();
        }
        this.watcher = chokidar.watch(this.currentPath, {
            ignored: /(^|[\/\\])\./, // ignore dotfiles
            persistent: true
        });
        // Only refresh the top-level tree when actual file/folder changes occur
        this.watcher
            .on('add', () => this.loadFileTree())
            .on('change', () => this.loadFileTree())
            .on('unlink', () => this.loadFileTree())
            .on('addDir', () => this.loadFileTree())
            .on('unlinkDir', () => this.loadFileTree());
    }

    updateCurrentPath() {
        this.currentPathElement.textContent = this.currentPath;
    }


    async loadFileTree() {
        try {
            const items = await ipcRenderer.invoke('read-directory', this.currentPath);
            this.renderFileTree(items);
            this.updateCurrentPath();
        } catch (error) {
            console.error('Error loading file tree:', error);
        }
    }

    renderFileTree(items) {
        this.fileTree.innerHTML = '';
        // Robustly filter out any '..' item
        const filteredItems = items.filter(item => item.name !== '..');
        // Sort items: folders first, then files
        const sortedItems = filteredItems.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
        sortedItems.forEach(item => {
            if (item.name !== '..') {
                const treeItem = this.createTreeItem(item);
                this.fileTree.appendChild(treeItem);
            }
        });
    }

    createTreeItem(item) {
        const treeItem = document.createElement('div');
        treeItem.className = 'cm-tree-item';
        treeItem.dataset.path = item.path;
        treeItem.dataset.name = item.name;
        treeItem.dataset.isDirectory = item.isDirectory;

        treeItem.innerHTML = `
            <div class="cm-tree-item-content">
                ${item.isDirectory ? '<div class="cm-tree-item-toggle"><i class="cm-codicon cm-codicon-chevron-right"></i></div>' : ''}
                <div class="cm-tree-item-icon">
                    <i class="cm-codicon ${item.isDirectory ? 'cm-codicon-folder' : this.getFileIcon(item.name)}"></i>
                </div>
                <div class="cm-tree-item-name">${item.name}</div>
            </div>
            ${item.isDirectory ? '<div class="cm-tree-item-children"></div>' : ''}
        `;

        // Event listeners
        treeItem.addEventListener('click', (e) => this.handleItemClick(e, item));
        treeItem.addEventListener('dblclick', (e) => this.handleItemDoubleClick(e, item));
        treeItem.addEventListener('contextmenu', (e) => this.handleFileItemContextMenu(e, treeItem));

        // Drag and drop
        treeItem.draggable = true;
        treeItem.addEventListener('dragstart', (e) => this.handleDragStart(e, treeItem));
        treeItem.addEventListener('dragover', (e) => this.handleDragOver(e, treeItem));
        treeItem.addEventListener('drop', (e) => this.handleDrop(e, treeItem));
        treeItem.addEventListener('dragenter', (e) => this.handleDragEnter(e, treeItem));
        treeItem.addEventListener('dragleave', (e) => this.handleDragLeave(e, treeItem));
        treeItem.addEventListener('dragend', (e) => this.handleDragEnd(e, treeItem));

        // Folder expand/collapse
        if (item.isDirectory) {
            const toggle = treeItem.querySelector('.cm-tree-item-toggle');
            const children = treeItem.querySelector('.cm-tree-item-children');
            toggle.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (children.classList.contains('expanded')) {
                    // Collapse
                    children.classList.remove('expanded');
                    toggle.classList.remove('expanded');
                    children.innerHTML = '';
                } else {
                    // Expand
                    try {
                        const items = await ipcRenderer.invoke('read-directory', item.path);
                        children.innerHTML = '';
                        const sortedItems = items.sort((a, b) => {
                            if (a.isDirectory && !b.isDirectory) return -1;
                            if (!a.isDirectory && b.isDirectory) return 1;
                            return a.name.localeCompare(b.name);
                        });
                        sortedItems.forEach(childItem => {
                            const childTreeItem = this.createTreeItem(childItem);
                            children.appendChild(childTreeItem);
                        });
                        children.classList.add('expanded');
                        toggle.classList.add('expanded');
                    } catch (error) {
                        console.error('Error expanding folder:', error);
                    }
                }
            });
        }

        return treeItem;
    }





    getFileIcon(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const iconMap = {
            '.js': 'cm-codicon-file-code',
            '.ts': 'cm-codicon-file-code',
            '.html': 'cm-codicon-file-code',
            '.css': 'cm-codicon-file-code',
            '.json': 'cm-codicon-file-code',
            '.pl': 'cm-codicon-file-code',
            '.pm': 'cm-codicon-file-code',
            '.py': 'cm-codicon-file-code',
            '.md': 'cm-codicon-file',
            '.txt': 'cm-codicon-file',
            '.pdf': 'cm-codicon-file-pdf',
            '.zip': 'cm-codicon-file-zip',
            '.mp4': 'cm-codicon-file-media',
            '.mov': 'cm-codicon-file-media',
            '.avi': 'cm-codicon-file-media'
        };

        return iconMap[ext] || 'cm-codicon-file';
    }

    handleItemClick(e, item) {
        e.stopPropagation();

        // Close context menu when clicking on any file/folder item
        if (this.contextMenu.style.display === 'block') {
            this.hideContextMenu();
        }

        const treeItem = e.currentTarget;
        const isCtrlPressed = e.ctrlKey || e.metaKey;
        const isShiftPressed = e.shiftKey;

        if (isCtrlPressed) {
            // Ctrl+Click: Toggle selection of clicked item
            if (this.selectedItems.has(item.path)) {
                // Deselect if already selected
                this.selectedItems.delete(item.path);
                treeItem.classList.remove('selected');
                if (this.selectedItem === item) {
                    // If we're deselecting the primary selected item, choose another one
                    const remainingItems = Array.from(this.selectedItems);
                    if (remainingItems.length > 0) {
                        const newPrimaryPath = remainingItems[0];
                        const newPrimaryElement = document.querySelector(`[data-path="${CSS.escape(newPrimaryPath)}"]`);
                        this.selectedItem = newPrimaryElement ? { path: newPrimaryPath } : null;
                    } else {
                        this.selectedItem = null;
                    }
                }
            } else {
                // Select if not selected
                this.selectedItems.add(item.path);
                treeItem.classList.add('selected');
                this.selectedItem = item;
                this.lastSelectedItem = item;
            }
        } else if (isShiftPressed && this.lastSelectedItem) {
            // Shift+Click: Select range from last selected to clicked item
            this.selectRange(this.lastSelectedItem, item);
        } else {
            // Normal click: Clear all selections and select only this item
            this.deselectAllItems();

            // Add the new selection
            this.selectedItems.add(item.path);
            treeItem.classList.add('selected');
            this.selectedItem = item;
            this.lastSelectedItem = item;
        }

        // If it's a folder, toggle it on single click
        if (item.isDirectory) {
            this.toggleFolder(treeItem, item);
        }
    }

    async handleItemDoubleClick(e, item) {
        e.stopPropagation();

        if (item.isDirectory) {
            // Don't toggle again since single click already handles it
        } else {
            await this.openFile(item);
        }
    }

    async toggleFolder(treeItem, item) {
        const children = treeItem.querySelector('.cm-tree-item-children');
        const toggle = treeItem.querySelector('.cm-tree-item-toggle');

        if (children.classList.contains('expanded')) {
            // Collapse
            children.classList.remove('expanded');
            toggle.classList.remove('expanded');
            children.innerHTML = '';
        } else {
            // Expand
            try {
                const items = await ipcRenderer.invoke('read-directory', item.path);
                children.innerHTML = '';

                const sortedItems = items.sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                });

                sortedItems.forEach(childItem => {
                    const childTreeItem = this.createTreeItem(childItem);
                    children.appendChild(childTreeItem);
                });

                children.classList.add('expanded');
                toggle.classList.add('expanded');
            } catch (error) {
                console.error('Error expanding folder:', error);
            }
        }
    }

    async openFile(file) {
        try {
            // Check if it's a supported file type for the editor
            const supportedExtensions = [
                '.pl', '.pm', '.perl',        // Perl
                '.py',                        // Python
                '.js', '.jsx',                // JavaScript
                '.ts', '.tsx',                // TypeScript
                '.json',                      // JSON
                '.html', '.htm',              // HTML
                '.css', '.scss', '.less',     // CSS and preprocessors
                '.md', '.markdown',           // Markdown
                '.php',                       // PHP
                '.xml',                       // XML
                '.yaml', '.yml',              // YAML
                '.sql',                       // SQL
                '.sh', '.bash',               // Shell scripts
                '.cpp', '.c', '.h',           // C/C++
                '.java',                      // Java
                '.rb',                        // Ruby
                '.go',                        // Go
                '.rs',                        // Rust
                '.txt', '.log'                // Text files
            ];
            const fileExtension = path.extname(file.path).toLowerCase();

            if (supportedExtensions.includes(fileExtension)) {
                // Get the Monaco Editor instance and open file in tab
                const monacoEditor = window.monacoEditorInstance;
                if (monacoEditor) {
                    await monacoEditor.openFileInTab(file.path, file.name);
                    console.log('File opened in editor:', file.name);
                } else {
                    console.error('Monaco Editor instance not found');
                    // Fallback to system default
                    await ipcRenderer.invoke('open-file', file.path);
                }
            } else {
                // For unsupported file types, open with system default
                await ipcRenderer.invoke('open-file', file.path);
            }
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }

    deselectAllItems() {
        // Clear all selected items from the UI
        document.querySelectorAll('.cm-tree-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        this.selectedItems.clear();
        this.selectedItem = null;
    }

    selectRange(fromItem, toItem) {
        // Find all tree items to determine the range
        const allItems = Array.from(document.querySelectorAll('.cm-tree-item'));
        const fromIndex = allItems.findIndex(el => el.dataset.path === fromItem.path);
        const toIndex = allItems.findIndex(el => el.dataset.path === toItem.path);

        if (fromIndex === -1 || toIndex === -1) return;

        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);

        this.deselectAllItems();

        for (let i = start; i <= end; i++) {
            const item = allItems[i];
            const itemPath = item.dataset.path;
            this.selectedItems.add(itemPath);
            item.classList.add('selected');
        }

        this.selectedItem = toItem;
    }

    updateCurrentPath() {
        const pathElement = document.querySelector('.cm-current-path');
        if (pathElement) {
            pathElement.textContent = this.currentPath;
        }
    }

    clearSelection() {
        this.deselectAllItems();
        this.lastSelectedItem = null;
    }

    selectSingleItem(item) {
        this.deselectAllItems();
        this.selectedItems.add(item.dataset.path);
        item.classList.add('selected');
        this.selectedItem = item;
        this.lastSelectedItem = item;
    }

    selectAllItems() {
        this.deselectAllItems();
        const allTreeItems = document.querySelectorAll('.cm-tree-item');
        allTreeItems.forEach(item => {
            this.selectedItems.add(item.dataset.path);
            item.classList.add('selected');
        });
        if (allTreeItems.length > 0) {
            this.selectedItem = allTreeItems[allTreeItems.length - 1];
            this.lastSelectedItem = this.selectedItem;
        }
    }

    handleFileTreeClick(e) {
        // Always close context menu when clicking in the file tree
        if (this.contextMenu.style.display === 'block' &&
            !this.contextMenu.contains(e.target)) {
            this.hideContextMenu();
        }

        // Clear selection when clicking on empty space in the file tree
        if (e.target === this.fileTree ||
            (e.target.closest('.cm-tree-item') === null &&
                e.target.closest('.cm-context-menu') === null &&
                e.target.closest('.cm-tree-item-content') === null)) {
            this.clearSelection();
        }
    }

    handleGlobalClick(e) {
        // Clear selection when clicking outside the explorer area
        const explorerContent = document.querySelector('.explorer-content');
        if (explorerContent && !explorerContent.contains(e.target) &&
            !e.target.closest('.cm-context-menu') &&
            !e.target.closest('.cm-input-dialog-overlay')) {
            this.clearSelection();
        }
    }

    handleGlobalContextMenuClick(e) {
        // Hide context menu when clicking outside of it
        if (this.contextMenu.style.display === 'block' &&
            !this.contextMenu.contains(e.target)) {
            this.hideContextMenu();
        }
    }

    handleFileItemContextMenu(e, item) {
        e.preventDefault();
        e.stopPropagation();

        console.log('Context menu triggered on item:', item.dataset.path);
        console.log('Item isDirectory:', item.dataset.isDirectory);
        console.log('Item name:', item.dataset.name);

        if (!this.selectedItems.has(item.dataset.path)) {
            this.selectSingleItem(item);
        }

        // Store the target folder for context menu actions
        if (item.dataset.isDirectory === 'true') {
            this.contextMenuTarget = item.dataset.path;
            console.log('Right-clicked on folder, target set to:', this.contextMenuTarget);
        } else {
            // If right-clicking on a file, use its parent directory
            this.contextMenuTarget = require('path').dirname(item.dataset.path);
            console.log('Right-clicked on file, target set to parent:', this.contextMenuTarget);
        }

        this.showContextMenu(e.clientX, e.clientY, true);
    }

    handleEmptySpaceContextMenu(e) {
        // Only show context menu if right-clicking on truly empty space
        if (e.target === this.fileTree ||
            (e.target.closest('.cm-tree-item') === null &&
                e.target.closest('.cm-tree-item-content') === null &&
                e.target.closest('.cm-context-menu') === null)) {
            e.preventDefault();
            e.stopPropagation();
            this.clearSelection();

            // Set context menu target to current directory for empty space
            this.contextMenuTarget = this.currentPath;

            this.showContextMenu(e.clientX, e.clientY, false);
        }
    }

    showContextMenu(x, y, hasSelection) {
        // Update paste menu item state
        const pasteItem = document.getElementById('cm-paste-menu-item');
        if (this.clipboard) {
            pasteItem.classList.remove('disabled');
        } else {
            pasteItem.classList.add('disabled');
        }

        // Show/hide menu items based on context
        const selectionBasedItems = [
            'cut', 'copy', 'rename', 'delete', 'reveal'
        ];

        selectionBasedItems.forEach(action => {
            const menuItem = document.querySelector(`[data-action="${action}"]`);
            if (menuItem) {
                if (hasSelection) {
                    menuItem.style.display = 'flex';
                } else {
                    menuItem.style.display = 'none';
                }
            }
        });

        // Hide separators that would be orphaned
        const separators = document.querySelectorAll('.cm-context-menu-separator');
        separators.forEach(separator => {
            if (hasSelection) {
                separator.style.display = 'block';
            } else {
                // Hide the separator before selection-based items when no selection
                const nextItem = separator.nextElementSibling;
                if (nextItem && selectionBasedItems.includes(nextItem.dataset.action)) {
                    separator.style.display = 'none';
                } else {
                    separator.style.display = 'block';
                }
            }
        });

        // Show context menu
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';

        // Adjust position if menu goes off screen
        const rect = this.contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.contextMenu.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            this.contextMenu.style.top = (y - rect.height) + 'px';
        }
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
        this.contextMenuTarget = null; // Clear the target when menu is hidden
    }

    async handleContextMenuAction(e) {
        e.preventDefault();
        e.stopPropagation();

        const action = e.target.closest('.cm-context-menu-item')?.dataset.action;
        if (!action) return;

        // Store the target before hiding the menu (which clears contextMenuTarget)
        const targetFolder = this.contextMenuTarget;
        console.log('Context menu action:', action, 'target folder:', targetFolder);

        this.hideContextMenu();

        switch (action) {
            case 'new-file':
                this.createNewFileInTargetFolder(targetFolder);
                break;
            case 'new-folder':
                this.createNewFolderInTargetFolder(targetFolder);
                break;
            case 'cut':
                this.cutSelectedItems();
                break;
            case 'copy':
                this.copySelectedItems();
                break;
            case 'paste':
                if (this.clipboard) {
                    await this.pasteFromClipboard();
                }
                break;
            case 'rename':
                if (this.selectedItems.size === 1) {
                    const selectedPath = Array.from(this.selectedItems)[0];
                    const selectedElement = this.findTreeItemByPath(selectedPath);
                    if (selectedElement) {
                        this.renameItem(selectedElement);
                    }
                }
                break;
            case 'delete':
                if (this.selectedItems.size > 0) {
                    await this.deleteSelectedItems();
                }
                break;
            case 'reveal':
                if (this.selectedItems.size === 1) {
                    const selectedPath = Array.from(this.selectedItems)[0];
                    this.revealInFileExplorer(selectedPath);
                }
                break;
        }
    }

    createNewFileInActiveFolder() {
        const targetFolder = this.getActiveTargetFolder();
        this.showInputDialog('New File', 'Enter file name:', '', async (name) => {
            if (!name.trim()) return;

            const filePath = path.join(targetFolder, name.trim());
            console.log('Creating file in active folder:', targetFolder);
            console.log('Full file path:', filePath);
            const result = await ipcRenderer.invoke('create-file', filePath);

            if (result.success) {
                this.refreshFileTree();
                // If we created in a selected folder, try to expand it after refresh
                if (targetFolder !== this.currentPath) {
                    // Use setTimeout to ensure the tree is refreshed before expanding
                    setTimeout(() => {
                        this.expandFolderToShowNewItem(targetFolder);
                    }, 100);
                }
            } else {
                console.error('Failed to create file:', result.error);
            }
        });
    }

    createNewFolderInActiveFolder() {
        const targetFolder = this.getActiveTargetFolder();
        this.showInputDialog('New Folder', 'Enter folder name:', '', async (name) => {
            if (!name.trim()) return;

            const folderPath = path.join(targetFolder, name.trim());
            console.log('Creating folder in active folder:', targetFolder);
            console.log('Full folder path:', folderPath);
            const result = await ipcRenderer.invoke('create-folder', folderPath);

            if (result.success) {
                this.refreshFileTree();
                // If we created in a selected folder, try to expand it after refresh
                if (targetFolder !== this.currentPath) {
                    // Use setTimeout to ensure the tree is refreshed before expanding
                    setTimeout(() => {
                        this.expandFolderToShowNewItem(targetFolder);
                    }, 100);
                }
            } else {
                console.error('Failed to create folder:', result.error);
            }
        });
    }

    getActiveTargetFolder() {
        console.log('=== DEBUG getActiveTargetFolder ===');
        console.log('Selected items count:', this.selectedItems.size);
        console.log('Selected items:', Array.from(this.selectedItems));

        // If there's a single selected item and it's a directory, use that
        if (this.selectedItems.size === 1) {
            const selectedItem = Array.from(this.selectedItems)[0];
            console.log('Single selected item:', selectedItem);

            // Find the item element by iterating through all tree items
            const treeItems = this.fileTree.querySelectorAll('.cm-tree-item');
            let itemElement = null;
            for (const item of treeItems) {
                if (item.dataset.path === selectedItem) {
                    itemElement = item;
                    break;
                }
            }

            console.log('Found item element:', itemElement);
            if (itemElement) {
                console.log('Item isDirectory:', itemElement.dataset.isDirectory);
                console.log('Item path:', itemElement.dataset.path);
            }

            if (itemElement && itemElement.dataset.isDirectory === 'true') {
                console.log('Using selected folder as target:', selectedItem);
                return selectedItem;
            }
        }

        // Otherwise, use the current path (root)
        console.log('Using current path as target:', this.currentPath);
        return this.currentPath;
    }

    createNewFileInTargetFolder(targetFolder = null) {
        const targetPath = targetFolder || this.contextMenuTarget || this.currentPath;
        console.log('Creating new file in target folder:', targetPath);
        console.log('Current path:', this.currentPath);
        console.log('Context menu target:', this.contextMenuTarget);
        console.log('Passed target folder:', targetFolder);
        this.showInputDialog('New File', 'Enter file name:', '', async (name) => {
            if (!name.trim()) return;

            const filePath = path.join(targetPath, name.trim());
            console.log('Target path:', targetPath);
            console.log('File name:', name.trim());
            console.log('Full file path:', filePath);
            const result = await ipcRenderer.invoke('create-file', filePath);

            if (result.success) {
                this.refreshFileTree();
                // If we created in a specific folder, try to expand it to show the new file after refresh
                if (targetPath && targetPath !== this.currentPath) {
                    setTimeout(() => {
                        this.expandFolderToShowNewItem(targetPath);
                    }, 100);
                }
            } else {
                console.error('Failed to create file:', result.error);
            }
        });
    }

    createNewFolderInTargetFolder(targetFolder = null) {
        const targetPath = targetFolder || this.contextMenuTarget || this.currentPath;
        console.log('Creating new folder in target folder:', targetPath);
        this.showInputDialog('New Folder', 'Enter folder name:', '', async (name) => {
            if (!name.trim()) return;

            const folderPath = path.join(targetPath, name.trim());
            console.log('Creating folder at path:', folderPath);
            const result = await ipcRenderer.invoke('create-folder', folderPath);

            if (result.success) {
                this.refreshFileTree();
                // If we created in a specific folder, try to expand it to show the new folder after refresh
                if (targetPath && targetPath !== this.currentPath) {
                    setTimeout(() => {
                        this.expandFolderToShowNewItem(targetPath);
                    }, 100);
                }
            } else {
                console.error('Failed to create folder:', result.error);
            }
        });
    }

    cutSelectedItems() {
        if (this.selectedItems.size === 0) {
            console.log('No items selected for cut');
            return;
        }

        console.log('Cutting items:', Array.from(this.selectedItems));

        this.clipboard = {
            items: Array.from(this.selectedItems).map(path => {
                const element = this.findTreeItemByPath(path);
                return {
                    path: path,
                    name: element ? element.dataset.name : path.split('\\').pop(),
                    isDirectory: element ? element.dataset.isDirectory === 'true' : false
                };
            }),
            operation: 'cut'
        };

        // Visual feedback for cut items
        Array.from(this.selectedItems).forEach(path => {
            const element = this.findTreeItemByPath(path);
            if (element) {
                element.style.opacity = '0.5';
                element.classList.add('cut-item');
            }
        });

        console.log('Items cut to clipboard');
    }

    copySelectedItems() {
        if (this.selectedItems.size === 0) {
            console.log('No items selected for copy');
            return;
        }

        console.log('Copying items:', Array.from(this.selectedItems));

        this.clipboard = {
            items: Array.from(this.selectedItems).map(path => {
                const element = this.findTreeItemByPath(path);
                return {
                    path: path,
                    name: element ? element.dataset.name : path.split('\\').pop(),
                    isDirectory: element ? element.dataset.isDirectory === 'true' : false
                };
            }),
            operation: 'copy'
        };

        console.log('Items copied to clipboard');
    }

    async pasteFromClipboard() {
        if (!this.clipboard) {
            console.log('No items in clipboard');
            return;
        }

        console.log('Pasting clipboard items:', this.clipboard);

        // Determine paste destination - use selected folder if available, otherwise current path
        const targetFolder = this.getActiveTargetFolder();
        console.log('Paste target folder:', targetFolder);

        for (const item of this.clipboard.items) {
            const destinationPath = path.join(targetFolder, item.name);
            console.log(`${this.clipboard.operation} item from:`, item.path, 'to:', destinationPath);

            if (this.clipboard.operation === 'cut') {
                const result = await ipcRenderer.invoke('move-item', item.path, destinationPath);
                if (!result.success) {
                    console.error('Failed to move item:', result.error);
                } else {
                    console.log('Successfully moved:', item.path);
                }
            } else {
                const result = await ipcRenderer.invoke('copy-item', item.path, destinationPath);
                if (!result.success) {
                    console.error('Failed to copy item:', result.error);
                } else {
                    console.log('Successfully copied:', item.path);
                }
            }
        }

        if (this.clipboard.operation === 'cut') {
            // Clear cut visual feedback
            document.querySelectorAll('.cm-tree-item.cut-item').forEach(item => {
                item.style.opacity = '';
                item.classList.remove('cut-item');
            });
            this.clipboard = null;
            console.log('Cut operation completed, clipboard cleared');
        }

        this.refreshFileTree();

        // If we pasted into a selected folder, expand it to show the new items
        if (targetFolder !== this.currentPath) {
            setTimeout(() => {
                this.expandFolderToShowNewItem(targetFolder);
            }, 100);
        }
    }

    renameItem(item) {
        console.log('Renaming item:', item);
        console.log('Item dataset:', item.dataset);

        if (!item.dataset || !item.dataset.name) {
            console.error('Invalid item for renaming - no dataset.name');
            return;
        }

        const currentName = item.dataset.name;
        console.log('Current name:', currentName);

        this.showInputDialog('Rename', 'Enter new name:', currentName, async (newName) => {
            if (!newName.trim() || newName.trim() === currentName) return;

            const oldPath = item.dataset.path;
            const newPath = path.join(path.dirname(oldPath), newName.trim());

            console.log('Renaming from:', oldPath, 'to:', newPath);

            const result = await ipcRenderer.invoke('rename-item', oldPath, newPath);

            if (result.success) {
                console.log('Rename successful');
                this.refreshFileTree();
            } else {
                console.error('Failed to rename item:', result.error);
            }
        });
    }

    findTreeItemByPath(path) {
        const treeItems = this.fileTree.querySelectorAll('.cm-tree-item');
        for (const item of treeItems) {
            if (item.dataset.path === path) {
                return item;
            }
        }
        return null;
    }

    async deleteSelectedItems() {
        if (this.selectedItems.size === 0) {
            console.log('No items selected for deletion');
            return;
        }

        // Get item details from paths
        const itemDetails = Array.from(this.selectedItems).map(path => {
            const element = this.findTreeItemByPath(path);
            return {
                path: path,
                name: element ? element.dataset.name : path.split('\\').pop(),
                element: element
            };
        });

        console.log('Deleting items:', itemDetails.map(item => item.path));
        const itemNames = itemDetails.map(item => item.name);
        const confirmed = confirm(`Are you sure you want to delete ${itemNames.length} item(s)?\n\n${itemNames.join('\n')}`);

        if (!confirmed) return;

        for (const item of itemDetails) {
            console.log('Deleting item:', item.path);
            const result = await ipcRenderer.invoke('delete-item', item.path);
            if (!result.success) {
                console.error('Failed to delete item:', result.error);
            } else {
                console.log('Successfully deleted:', item.path);
            }
        }

        this.refreshFileTree();
    }

    expandFolderToShowNewItem(folderPath) {
        console.log('Expanding folder to show new item:', folderPath);

        // Find the folder item in the tree by iterating through all tree items
        const treeItems = this.fileTree.querySelectorAll('.cm-tree-item');
        for (const item of treeItems) {
            if (item.dataset.path === folderPath && item.dataset.isDirectory === 'true') {
                console.log('Found folder item to expand:', item.dataset.path);

                const children = item.querySelector('.cm-tree-item-children');
                const toggle = item.querySelector('.cm-tree-item-toggle');

                // Only expand if it's not already expanded
                if (children && toggle && !children.classList.contains('expanded')) {
                    console.log('Expanding folder...');
                    // Use the existing toggle logic to expand the folder
                    this.toggleFolder(item, {
                        path: folderPath,
                        isDirectory: true,
                        name: item.dataset.name
                    });
                } else {
                    console.log('Folder is already expanded or missing toggle elements');
                }
                break;
            }
        }
    }

    async revealInFileExplorer(filePath) {
        console.log('Revealing in file explorer:', filePath);
        try {
            const result = await ipcRenderer.invoke('open-file', filePath);
            if (result.success) {
                console.log('Successfully revealed in file explorer');
            } else {
                console.error('Failed to reveal in file explorer:', result.error);
            }
        } catch (error) {
            console.error('Error calling reveal IPC:', error);
        }
    }

    async openFolderDialog() {
        console.log('Opening folder dialog...');
        try {
            const result = await ipcRenderer.invoke('open-folder-dialog');
            if (result.success && result.folderPath) {
                console.log('Selected folder:', result.folderPath);
                this.currentPath = result.folderPath;

                // Save the new directory to cache
                await ipcRenderer.invoke('save-current-directory', result.folderPath);

                this.loadFileTree();
                // Update the current path display
                document.getElementById('cm-current-path').textContent = result.folderPath;
            } else if (result.cancelled) {
                console.log('Folder selection cancelled');
            } else {
                console.error('Failed to open folder dialog:', result.error);
            }
        } catch (error) {
            console.error('Error calling folder dialog IPC:', error);
        }
    }

    showInputDialog(title, message, defaultValue, callback) {
        this.inputDialogTitle.textContent = title;
        this.inputDialogInput.value = defaultValue;
        this.inputDialogInput.placeholder = message;
        this.inputDialogOverlay.style.display = 'flex';

        // Force focus immediately
        this.inputDialogInput.focus();
        this.inputDialogInput.select();

        // Use requestAnimationFrame for better timing
        requestAnimationFrame(() => {
            this.inputDialogInput.focus();
            this.inputDialogInput.select();
        });

        // Multiple delayed attempts for different scenarios
        setTimeout(() => {
            this.inputDialogInput.focus();
            this.inputDialogInput.select();
        }, 10);

        setTimeout(() => {
            this.inputDialogInput.focus();
            this.inputDialogInput.select();
        }, 50);

        setTimeout(() => {
            this.inputDialogInput.focus();
            this.inputDialogInput.select();
        }, 100);

        // Final check and force focus if needed
        setTimeout(() => {
            if (document.activeElement !== this.inputDialogInput) {
                console.log('Input dialog focus failed, forcing focus');
                // Try removing and re-adding focus
                this.inputDialogInput.blur();
                setTimeout(() => {
                    this.inputDialogInput.focus();
                    this.inputDialogInput.select();
                }, 10);
            }
        }, 200);

        this.currentInputCallback = callback;
    }

    confirmInputDialog() {
        if (this.currentInputCallback) {
            this.currentInputCallback(this.inputDialogInput.value);
        }
        this.hideInputDialog();
    }

    cancelInputDialog() {
        this.hideInputDialog();
    }

    hideInputDialog() {
        this.inputDialogOverlay.style.display = 'none';
        this.currentInputCallback = null;
    }

    handleInputDialogKeydown(e) {
        if (e.key === 'Enter') {
            this.confirmInputDialog();
        } else if (e.key === 'Escape') {
            this.cancelInputDialog();
        }
    }

    handleKeyboardShortcuts(e) {
        // Check if we're in the explorer area or have selected items
        const isInExplorer = this.fileTree.contains(document.activeElement) ||
            this.selectedItems.size > 0 ||
            document.activeElement === this.inputDialogInput ||
            document.activeElement === document.body;

        // Only handle explorer shortcuts when appropriate
        if (!isInExplorer && document.activeElement !== this.inputDialogInput) {
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'c':
                    if (this.selectedItems.size > 0) {
                        e.preventDefault();
                        console.log('Ctrl+C shortcut triggered');
                        this.copySelectedItems();
                    }
                    break;
                case 'x':
                    if (this.selectedItems.size > 0) {
                        e.preventDefault();
                        console.log('Ctrl+X shortcut triggered');
                        this.cutSelectedItems();
                    }
                    break;
                case 'v':
                    if (this.clipboard) {
                        e.preventDefault();
                        console.log('Ctrl+V shortcut triggered');
                        this.pasteFromClipboard();
                    } else {
                        console.log('Ctrl+V shortcut triggered but no clipboard');
                    }
                    break;
                case 'a':
                    e.preventDefault();
                    this.selectAllItems();
                    break;
            }
        } else {
            switch (e.key) {
                case 'F2':
                    if (this.selectedItems.size === 1) {
                        e.preventDefault();
                        console.log('F2 shortcut triggered for rename');
                        const selectedPath = Array.from(this.selectedItems)[0];
                        const selectedElement = this.findTreeItemByPath(selectedPath);
                        if (selectedElement) {
                            this.renameItem(selectedElement);
                        }
                    }
                    break;
                case 'Delete':
                    if (this.selectedItems.size > 0) {
                        e.preventDefault();
                        console.log('Delete shortcut triggered');
                        this.deleteSelectedItems();
                    }
                    break;
                case 'F5':
                    e.preventDefault();
                    this.refreshFileTree();
                    break;
                case 'Escape':
                    e.preventDefault();
                    // Close context menu if open, otherwise clear selection
                    if (this.contextMenu.style.display === 'block') {
                        this.hideContextMenu();
                    } else {
                        this.clearSelection();
                    }
                    break;
            }
        }
    }

    refreshFileTree() {
        this.loadFileTree();
    }

    // Drag and drop handlers
    handleDragStart(e, item) {
        console.log('Drag started:', item.dataset.path);
        console.log('Event target:', e.target.className, e.target.tagName);
        console.log('Item element:', item.dataset.path);

        // Stop propagation to prevent parent items from also handling dragstart
        e.stopPropagation();

        this.draggedItem = item;
        item.classList.add('cm-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.path);
    }

    handleDragOver(e, item) {
        e.preventDefault();
        console.log('Drag over:', item.dataset.path, 'isDirectory:', item.dataset.isDirectory);
        if (item.dataset.isDirectory === 'true' && item !== this.draggedItem) {
            e.dataTransfer.dropEffect = 'move';
        }
    }

    handleDragEnter(e, item) {
        console.log('Drag enter:', item.dataset.path, 'isDirectory:', item.dataset.isDirectory);
        if (item.dataset.isDirectory === 'true' && item !== this.draggedItem) {
            console.log('Adding drag-over class to folder:', item.dataset.path);
            item.classList.add('cm-drag-over');
        }
    }

    handleDragLeave(e, item) {
        // Only remove drag-over if we're actually leaving the item
        if (!item.contains(e.relatedTarget)) {
            console.log('Drag leave folder:', item.dataset.path);
            item.classList.remove('cm-drag-over');
        }
    }

    handleDragEnd(e, item) {
        console.log('Drag ended for:', item.dataset.path);
        item.classList.remove('cm-dragging');
        // Clean up any remaining drag-over states
        document.querySelectorAll('.cm-drag-over').forEach(el => {
            el.classList.remove('cm-drag-over');
        });
        this.draggedItem = null;
    }

    handleRootDragOver(e) {
        console.log('Root dragover event:', e.target.className, e.target.tagName);
        // Only allow drop on empty space (not on tree items)
        if (!e.target.closest('.cm-tree-item')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            console.log('Drag over root area - drop allowed');
            // Add visual feedback
            this.fileTree.style.backgroundColor = 'rgba(0, 122, 204, 0.1)';
        } else {
            console.log('Drag over tree item - not root area');
        }
    }

    handleRootDragLeave(e) {
        // Only clear feedback when leaving the entire file tree area
        if (!this.fileTree.contains(e.relatedTarget)) {
            console.log('Drag left root area');
            this.fileTree.style.backgroundColor = '';
        }
    }

    async handleRootDrop(e) {
        console.log('=== ROOT DROP EVENT ===');
        console.log('Event target:', e.target.className, e.target.tagName);

        const closestTreeItem = e.target.closest('.cm-tree-item');
        console.log('Closest tree item:', closestTreeItem);
        console.log('Dragged item:', this.draggedItem ? this.draggedItem.dataset.path : 'none');

        if (!this.draggedItem) return;

        // Handle drop on empty space OR on a file (not folder)
        const shouldDropToRoot = !closestTreeItem ||
            (closestTreeItem && closestTreeItem.dataset.isDirectory !== 'true');

        console.log('Should drop to root:', shouldDropToRoot);
        console.log('Target is directory:', closestTreeItem ? closestTreeItem.dataset.isDirectory : 'no target');

        if (shouldDropToRoot) {
            e.preventDefault();
            e.stopPropagation(); // Prevent other handlers from running

            console.log('Processing root drop for:', this.draggedItem.dataset.path);

            // Clear visual feedback
            this.fileTree.style.backgroundColor = '';

            const sourcePath = this.draggedItem.dataset.path;
            const fileName = this.draggedItem.dataset.name;
            const destinationPath = path.join(this.currentPath, fileName);

            console.log('Moving from:', sourcePath);
            console.log('Moving to:', destinationPath);
            console.log('Current path:', this.currentPath);

            // Check if we're trying to move to the same location
            if (sourcePath === destinationPath) {
                console.log('Source and destination are the same, skipping move');
                return;
            }

            const result = await ipcRenderer.invoke('move-item', sourcePath, destinationPath);

            if (result.success) {
                console.log('Successfully moved to root');
                this.refreshFileTree();
            } else {
                console.error('Failed to move item to root:', result.error);
            }

            // Cleanup
            if (this.draggedItem) {
                this.draggedItem.classList.remove('cm-dragging');
                this.draggedItem = null;
            }
        } else {
            console.log('Drop not processed - on tree item or no dragged item');
            // Clear visual feedback anyway
            this.fileTree.style.backgroundColor = '';
        }
    }

    async handleDrop(e, item) {
        console.log('=== ITEM DROP EVENT ===');
        console.log('Drop target:', item.dataset.path);
        console.log('Target is directory:', item.dataset.isDirectory);
        console.log('Dragged item:', this.draggedItem ? this.draggedItem.dataset.path : 'none');

        // Only handle drops into folders
        if (this.draggedItem && item.dataset.isDirectory === 'true' && item !== this.draggedItem) {
            e.preventDefault();
            e.stopPropagation(); // Prevent the root drop handler from running

            console.log('Processing item drop into folder:', item.dataset.path);

            item.classList.remove('cm-drag-over');

            const sourcePath = this.draggedItem.dataset.path;
            const destinationPath = path.join(item.dataset.path, this.draggedItem.dataset.name);

            console.log('Moving from:', sourcePath);
            console.log('Moving to:', destinationPath);

            const result = await ipcRenderer.invoke('move-item', sourcePath, destinationPath);

            if (result.success) {
                console.log('Successfully moved into folder');
                this.refreshFileTree();

                // Expand the target folder to show the moved item
                setTimeout(() => {
                    this.expandFolderToShowNewItem(item.dataset.path);
                }, 100);
            } else {
                console.error('Failed to move item:', result.error);
            }

            // Cleanup
            if (this.draggedItem) {
                this.draggedItem.classList.remove('cm-dragging');
                this.draggedItem = null;
            }
        } else {
            console.log('Not a folder drop - letting event bubble to root handler');
            // Don't prevent default or stop propagation - let the root handler deal with it
            item.classList.remove('cm-drag-over');
        }
    }

    handleDragEnd(e, item) {
        console.log('Drag ended for:', item.dataset.path);
        item.classList.remove('cm-dragging');

        // Clear any remaining visual feedback
        const allItems = this.fileTree.querySelectorAll('.cm-tree-item');
        allItems.forEach(item => item.classList.remove('cm-drag-over'));
        this.fileTree.style.backgroundColor = '';

        this.draggedItem = null;
    }
}

// Initialize the file explorer when the DOM is ready
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConceptualMapFileExplorer;
} else {
    // Browser environment - auto-initialize
    document.addEventListener('DOMContentLoaded', () => {
        window.cmFileExplorer = new ConceptualMapFileExplorer();
    });
}
