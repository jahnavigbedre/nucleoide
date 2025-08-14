const { ipcRenderer } = require('electron');
const path = require('path');
const chokidar = require('chokidar');
const fs = require('fs');

class FileExplorer {
    constructor() {
        this.currentPath = '';
        this.selectedItem = null;
        this.selectedItems = new Set(); // Multi-select support
        this.lastSelectedItem = null; // For shift+click range selection
        this.draggedItem = null;
        this.clipboard = null;
        this.watcher = null;
        this.fileTree = document.getElementById('file-tree');
        this.contextMenu = document.getElementById('context-menu');
        this.currentPathElement = document.getElementById('current-path');
        this.fileInfoElement = document.getElementById('file-info');
        
        // Input dialog elements
        this.inputDialogOverlay = document.getElementById('input-dialog-overlay');
        this.inputDialogTitle = document.getElementById('input-dialog-title');
        this.inputDialogInput = document.getElementById('input-dialog-input');
        this.inputDialogOk = document.getElementById('input-dialog-ok');
        this.inputDialogCancel = document.getElementById('input-dialog-cancel');
        
        this.init();
    }

    async init() {
        await this.setupInitialPath();
        this.setupEventListeners();
        this.setupFileWatcher();
        this.loadFileTree();
        this.updateCurrentPath();
    }

    async setupInitialPath() {
        this.currentPath = await ipcRenderer.invoke('get-home-directory');
    }

    setupEventListeners() {
        // Action buttons
        document.getElementById('new-file-btn').addEventListener('click', () => this.createNewFileInActiveFolder());
        document.getElementById('new-folder-btn').addEventListener('click', () => this.createNewFolderInActiveFolder());
        document.getElementById('refresh-btn').addEventListener('click', () => this.refreshFileTree());

        // Context menu
        document.addEventListener('click', () => this.hideContextMenu());
        this.contextMenu.addEventListener('click', (e) => this.handleContextMenuAction(e));

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
        
        // Ensure input is focusable when dialog is shown
        this.inputDialogInput.addEventListener('focus', () => {
            // Ensure the input is properly focused
            this.inputDialogInput.select();
        });

        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    setupFileWatcher() {
        this.watcher = chokidar.watch(this.currentPath, {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true
        });

        this.watcher
            .on('add', () => this.refreshFileTree())
            .on('change', () => this.refreshFileTree())
            .on('unlink', () => this.refreshFileTree())
            .on('addDir', () => this.refreshFileTree())
            .on('unlinkDir', () => this.refreshFileTree());
    }

    updateCurrentPath() {
        this.currentPathElement.textContent = this.currentPath;
    }

    async loadFileTree() {
        try {
            const items = await ipcRenderer.invoke('read-directory', this.currentPath);
            this.renderFileTree(items);
        } catch (error) {
            console.error('Error loading file tree:', error);
        }
    }

    renderFileTree(items) {
        this.fileTree.innerHTML = '';
        
        // Sort items: folders first, then files
        const sortedItems = items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        sortedItems.forEach(item => {
            const treeItem = this.createTreeItem(item);
            this.fileTree.appendChild(treeItem);
        });
    }

    createTreeItem(item) {
        const treeItem = document.createElement('div');
        treeItem.className = 'tree-item';
        treeItem.dataset.path = item.path;
        treeItem.dataset.name = item.name;
        treeItem.dataset.isDirectory = item.isDirectory;
        treeItem.dataset.item = JSON.stringify(item); // Store full item data for range selection

        const icon = this.getFileIcon(item);
        const name = item.name;

        treeItem.innerHTML = `
            <div class="tree-item-content">
                ${item.isDirectory ? '<div class="tree-item-toggle"><i class="codicon codicon-chevron-right"></i></div>' : ''}
                <div class="tree-item-icon">
                    <i class="codicon ${icon}"></i>
                </div>
                <div class="tree-item-name">${name}</div>
            </div>
            ${item.isDirectory ? '<div class="tree-item-children"></div>' : ''}
        `;

        // Event listeners
        treeItem.addEventListener('click', (e) => this.handleItemClick(e, item));
        treeItem.addEventListener('dblclick', (e) => this.handleItemDoubleClick(e, item));
        treeItem.addEventListener('contextmenu', (e) => this.showContextMenu(e, item));
        
        // Drag and drop
        treeItem.draggable = true;
        treeItem.addEventListener('dragstart', (e) => this.handleDragStart(e, item));
        treeItem.addEventListener('dragover', (e) => this.handleDragOver(e, item));
        treeItem.addEventListener('drop', (e) => this.handleDrop(e, item));
        treeItem.addEventListener('dragenter', (e) => this.handleDragEnter(e, item));
        treeItem.addEventListener('dragleave', (e) => this.handleDragLeave(e, item));

        return treeItem;
    }

    getFileIcon(item) {
        if (item.isDirectory) {
            return 'codicon-folder';
        }

        const ext = path.extname(item.name).toLowerCase();
        const name = item.name.toLowerCase();

        // File type mappings
        const fileTypes = {
            // Images
            '.png': 'codicon-file-media',
            '.jpg': 'codicon-file-media',
            '.jpeg': 'codicon-file-media',
            '.gif': 'codicon-file-media',
            '.svg': 'codicon-file-media',
            '.ico': 'codicon-file-media',
            '.bmp': 'codicon-file-media',
            '.webp': 'codicon-file-media',

            // Videos
            '.mp4': 'codicon-file-media',
            '.avi': 'codicon-file-media',
            '.mov': 'codicon-file-media',
            '.wmv': 'codicon-file-media',
            '.flv': 'codicon-file-media',
            '.webm': 'codicon-file-media',

            // Audio
            '.mp3': 'codicon-file-media',
            '.wav': 'codicon-file-media',
            '.flac': 'codicon-file-media',
            '.aac': 'codicon-file-media',
            '.ogg': 'codicon-file-media',

            // Archives
            '.zip': 'codicon-file-zip',
            '.rar': 'codicon-file-zip',
            '.7z': 'codicon-file-zip',
            '.tar': 'codicon-file-zip',
            '.gz': 'codicon-file-zip',

            // Code files
            '.js': 'codicon-file-code',
            '.ts': 'codicon-file-code',
            '.jsx': 'codicon-file-code',
            '.tsx': 'codicon-file-code',
            '.html': 'codicon-file-code',
            '.css': 'codicon-file-code',
            '.scss': 'codicon-file-code',
            '.sass': 'codicon-file-code',
            '.less': 'codicon-file-code',
            '.json': 'codicon-file-code',
            '.xml': 'codicon-file-code',
            '.yaml': 'codicon-file-code',
            '.yml': 'codicon-file-code',
            '.py': 'codicon-file-code',
            '.java': 'codicon-file-code',
            '.cpp': 'codicon-file-code',
            '.c': 'codicon-file-code',
            '.cs': 'codicon-file-code',
            '.php': 'codicon-file-code',
            '.rb': 'codicon-file-code',
            '.go': 'codicon-file-code',
            '.rs': 'codicon-file-code',
            '.swift': 'codicon-file-code',
            '.kt': 'codicon-file-code',
            '.sql': 'codicon-file-code',
            '.sh': 'codicon-file-code',
            '.ps1': 'codicon-file-code',
            '.bat': 'codicon-file-code',

            // Config files
            '.env': 'codicon-settings-gear',
            '.config': 'codicon-settings-gear',
            '.ini': 'codicon-settings-gear',
            '.conf': 'codicon-settings-gear',

            // Documents
            '.md': 'codicon-file',
            '.txt': 'codicon-file',
            '.pdf': 'codicon-file-pdf',
            '.doc': 'codicon-file',
            '.docx': 'codicon-file',
            '.xls': 'codicon-file',
            '.xlsx': 'codicon-file',
            '.ppt': 'codicon-file',
            '.pptx': 'codicon-file'
        };

        return fileTypes[ext] || 'codicon-file';
    }

    handleItemClick(e, item) {
        e.stopPropagation();
        
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
                    this.selectedItem = null;
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
            // Normal click: Select only this item
            this.deselectAllItems();
            this.selectedItems.add(item.path);
            treeItem.classList.add('selected');
            this.selectedItem = item;
            this.lastSelectedItem = item;
        }
        
        // Update file info
        this.updateFileInfo(item);

        // If it's a folder, toggle it on single click
        if (item.isDirectory) {
            this.toggleFolder(treeItem, item);
        }
    }

    async handleItemDoubleClick(e, item) {
        e.stopPropagation();
        
        if (item.isDirectory) {
            // Don't toggle again since single click already handles it
            // Just prevent the double-click from doing anything extra
        } else {
            await this.openFile(item);
        }
    }

    async openFolder(folder) {
        this.currentPath = folder.path;
        await this.loadFileTree();
        this.updateCurrentPath();
        
        // Update file watcher
        if (this.watcher) {
            this.watcher.close();
        }
        this.setupFileWatcher();
    }

    async openFile(file) {
        try {
            await ipcRenderer.invoke('open-file', file.path);
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }

    updateFileInfo(item) {
        if (!item) {
            if (this.selectedItems.size > 0) {
                // Show multi-selection info
                const selectedCount = this.selectedItems.size;
                const info = `
                    <h3>${selectedCount} item${selectedCount > 1 ? 's' : ''} selected</h3>
                    <p><strong>Selection:</strong> ${selectedCount} item${selectedCount > 1 ? 's' : ''}</p>
                `;
                this.fileInfoElement.innerHTML = info;
            } else {
                this.fileInfoElement.innerHTML = '<p>No file selected</p>';
            }
            return;
        }

        if (this.selectedItems.size > 1) {
            // Show multi-selection info with primary item details
            const selectedCount = this.selectedItems.size;
            const info = `
                <h3>${selectedCount} item${selectedCount > 1 ? 's' : ''} selected</h3>
                <p><strong>Primary:</strong> ${item.name}</p>
                <p><strong>Type:</strong> ${item.isDirectory ? 'Folder' : 'File'}</p>
                <p><strong>Path:</strong> ${item.path}</p>
                ${!item.isDirectory ? `<p><strong>Extension:</strong> ${path.extname(item.name) || 'None'}</p>` : ''}
            `;
            this.fileInfoElement.innerHTML = info;
        } else {
            // Show single item info
            const info = `
                <h3>${item.name}</h3>
                <p><strong>Type:</strong> ${item.isDirectory ? 'Folder' : 'File'}</p>
                <p><strong>Path:</strong> ${item.path}</p>
                ${!item.isDirectory ? `<p><strong>Extension:</strong> ${path.extname(item.name) || 'None'}</p>` : ''}
            `;
            this.fileInfoElement.innerHTML = info;
        }
    }

    async toggleFolder(treeItem, item) {
        const children = treeItem.querySelector('.tree-item-children');
        const toggle = treeItem.querySelector('.tree-item-toggle');
        
        if (children.classList.contains('expanded')) {
            // Collapse
            children.classList.remove('expanded');
            toggle.classList.remove('expanded');
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

    showContextMenu(e, item) {
        e.preventDefault();
        e.stopPropagation();

        // If the clicked item is not in the current selection, select only it
        if (!this.selectedItems.has(item.path)) {
            this.deselectAllItems();
            this.selectedItems.add(item.path);
            e.currentTarget.classList.add('selected');
            this.selectedItem = item;
            this.lastSelectedItem = item;
        }

        this.updateContextMenuVisibility(item);
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = e.pageX + 'px';
        this.contextMenu.style.top = e.pageY + 'px';
        this.contextMenu.dataset.targetPath = item.path;
        this.contextMenu.dataset.targetName = item.name;
        this.contextMenu.dataset.targetIsDirectory = item.isDirectory;
    }

    handleEmptySpaceContextMenu(e) {
        // Check if we clicked on a tree item
        const clickedElement = e.target.closest('.tree-item');
        if (clickedElement) {
            // If we clicked on a tree item, let the item's context menu handle it
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        // Deselect any selected item when clicking on empty space
        this.deselectAllItems();

        this.updateContextMenuVisibility(null);
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = e.pageX + 'px';
        this.contextMenu.style.top = e.pageY + 'px';
        this.contextMenu.dataset.targetPath = this.currentPath;
        this.contextMenu.dataset.targetName = '';
        this.contextMenu.dataset.targetIsDirectory = 'true';
    }

    handleFileTreeClick(e) {
        // Check if we clicked on a tree item
        const clickedElement = e.target.closest('.tree-item');
        if (clickedElement) {
            // If we clicked on a tree item, let the item's click handler deal with it
            return;
        }

        // If we clicked on empty space, deselect all items
        this.deselectAllItems();
    }

    deselectAllItems() {
        // Remove selection from all items
        document.querySelectorAll('.tree-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Clear selected items
        this.selectedItems.clear();
        this.selectedItem = null;
        this.lastSelectedItem = null;
        
        // Update file info to show no selection
        this.updateFileInfo(null);
    }

    selectRange(startItem, endItem) {
        // Get all tree items in the current view
        const allTreeItems = Array.from(document.querySelectorAll('.tree-item'));
        const allItems = allTreeItems.map(el => ({
            element: el,
            item: el.dataset.item ? JSON.parse(el.dataset.item) : null
        })).filter(item => item.item);
        
        // Find indices of start and end items
        const startIndex = allItems.findIndex(item => item.item.path === startItem.path);
        const endIndex = allItems.findIndex(item => item.item.path === endItem.path);
        
        if (startIndex === -1 || endIndex === -1) return;
        
        // Select range from start to end (inclusive)
        const minIndex = Math.min(startIndex, endIndex);
        const maxIndex = Math.max(startIndex, endIndex);
        
        this.deselectAllItems();
        
        for (let i = minIndex; i <= maxIndex; i++) {
            const item = allItems[i];
            this.selectedItems.add(item.item.path);
            item.element.classList.add('selected');
        }
        
        // Set the last clicked item as the primary selection
        this.selectedItem = endItem;
        this.lastSelectedItem = endItem;
        
        // Update file info with the last selected item
        this.updateFileInfo(endItem);
    }

    selectAllItems() {
        // Get all visible tree items
        const allTreeItems = Array.from(document.querySelectorAll('.tree-item'));
        
        this.deselectAllItems();
        
        allTreeItems.forEach(treeItem => {
            const item = JSON.parse(treeItem.dataset.item);
            this.selectedItems.add(item.path);
            treeItem.classList.add('selected');
        });
        
        // Set the first item as the primary selection
        if (allTreeItems.length > 0) {
            const firstItem = JSON.parse(allTreeItems[0].dataset.item);
            this.selectedItem = firstItem;
            this.lastSelectedItem = firstItem;
            this.updateFileInfo(firstItem);
        }
    }

    getActiveFolderPath() {
        // If there's a selected item and it's a directory, use that path
        if (this.selectedItem && this.selectedItem.isDirectory) {
            return this.selectedItem.path;
        }
        
        // If multiple items are selected, use the parent directory of the first selected item
        if (this.selectedItems.size > 0) {
            const firstSelectedPath = Array.from(this.selectedItems)[0];
            return path.dirname(firstSelectedPath);
        }
        
        // Otherwise, use the current root path
        return this.currentPath;
    }

    updateContextMenuVisibility(item) {
        const pasteMenuItem = document.getElementById('paste-menu-item');
        const renameMenuItem = this.contextMenu.querySelector('[data-action="rename"]');
        const deleteMenuItem = this.contextMenu.querySelector('[data-action="delete"]');
        const copyMenuItem = this.contextMenu.querySelector('[data-action="copy"]');
        const cutMenuItem = this.contextMenu.querySelector('[data-action="cut"]');

        // Show/hide paste based on clipboard content
        if (this.clipboard) {
            pasteMenuItem.style.display = 'flex';
        } else {
            pasteMenuItem.style.display = 'none';
        }

        // Show/hide item-specific actions based on selection
        if (this.selectedItems.size > 0) {
            // Show actions for selected items
            deleteMenuItem.style.display = 'flex';
            copyMenuItem.style.display = 'flex';
            cutMenuItem.style.display = 'flex';
            
            // Only show rename for single selection
            if (this.selectedItems.size === 1) {
                renameMenuItem.style.display = 'flex';
            } else {
                renameMenuItem.style.display = 'none';
            }
        } else {
            // No selection, hide all item-specific actions
            renameMenuItem.style.display = 'none';
            deleteMenuItem.style.display = 'none';
            copyMenuItem.style.display = 'none';
            cutMenuItem.style.display = 'none';
        }
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
    }

    handleContextMenuAction(e) {
        const menuItem = e.target.closest('.context-menu-item');
        if (!menuItem) return;

        const action = menuItem.dataset.action;
        const targetPath = this.contextMenu.dataset.targetPath;
        const targetName = this.contextMenu.dataset.targetName;
        const targetIsDirectory = this.contextMenu.dataset.targetIsDirectory === 'true';

        this.hideContextMenu();

        switch (action) {
            case 'new-file':
                this.createNewFile(targetPath);
                break;
            case 'new-folder':
                this.createNewFolder(targetPath);
                break;
            case 'paste':
                this.pasteItem(targetPath);
                break;
            case 'rename':
                if (targetName && this.selectedItems.size === 1) {
                    this.startRename(targetPath, targetName);
                }
                break;
            case 'delete':
                if (this.selectedItems.size > 0) {
                    this.deleteMultipleItems();
                }
                break;
            case 'copy':
                if (this.selectedItems.size > 0) {
                    this.copyMultipleItems();
                }
                break;
            case 'cut':
                if (this.selectedItems.size > 0) {
                    this.cutMultipleItems();
                }
                break;
        }
    }

    // Custom input dialog methods
    showInputDialog(title, placeholder = 'Enter name...', initialValue = '') {
        this.inputDialogTitle.textContent = title;
        this.inputDialogInput.placeholder = placeholder;
        this.inputDialogInput.value = initialValue;
        this.inputDialogOverlay.style.display = 'flex';
        
        // Use requestAnimationFrame to ensure the dialog is fully rendered before focusing
        requestAnimationFrame(() => {
            this.inputDialogInput.focus();
            
            // Select all text if there's an initial value (for rename)
            if (initialValue) {
                this.inputDialogInput.select();
            }
            
            // Fallback: try to focus again after a short delay if not focused
            setTimeout(() => {
                if (document.activeElement !== this.inputDialogInput) {
                    this.inputDialogInput.focus();
                    if (initialValue) {
                        this.inputDialogInput.select();
                    }
                }
            }, 50);
        });
        
        return new Promise((resolve) => {
            this.inputDialogResolve = resolve;
        });
    }

    confirmInputDialog() {
        const value = this.inputDialogInput.value.trim();
        
        // Store the resolve function before hiding the dialog
        const resolve = this.inputDialogResolve;
        
        this.hideInputDialog();
        
        if (resolve) {
            resolve(value);
        }
    }

    cancelInputDialog() {
        // Store the resolve function before hiding the dialog
        const resolve = this.inputDialogResolve;
        
        this.hideInputDialog();
        
        if (resolve) {
            resolve(null);
        }
    }

    hideInputDialog() {
        this.inputDialogOverlay.style.display = 'none';
        this.inputDialogResolve = null;
    }

    handleInputDialogKeydown(e) {
        if (e.key === 'Enter') {
            this.confirmInputDialog();
        } else if (e.key === 'Escape') {
            this.cancelInputDialog();
        }
    }

    async createNewFileInActiveFolder() {
        const parentPath = this.getActiveFolderPath();
        await this.createNewFile(parentPath);
    }

    async createNewFile(parentPath = this.currentPath) {
        const fileName = await this.showInputDialog('New File', 'Enter file name');
        if (!fileName) return;

        const filePath = path.join(parentPath, fileName);
        const result = await ipcRenderer.invoke('create-file', filePath);
        
        if (result.success) {
            this.refreshFileTree();
        } else {
            alert('Error creating file: ' + result.error);
        }
    }

    async createNewFolderInActiveFolder() {
        const parentPath = this.getActiveFolderPath();
        await this.createNewFolder(parentPath);
    }

    async createNewFolder(parentPath = this.currentPath) {
        const folderName = await this.showInputDialog('New Folder', 'Enter folder name');
        if (!folderName) return;

        const folderPath = path.join(parentPath, folderName);
        const result = await ipcRenderer.invoke('create-folder', folderPath);
        
        if (result.success) {
            this.refreshFileTree();
        } else {
            alert('Error creating folder: ' + result.error);
        }
    }

    async startRename(itemPath, currentName) {
        const newName = await this.showInputDialog('Rename', 'Enter new name', currentName);
        if (!newName || newName === currentName) return;

        const newPath = path.join(path.dirname(itemPath), newName);
        const result = await ipcRenderer.invoke('rename-item', itemPath, newPath);
        
        if (result.success) {
            this.refreshFileTree();
        } else {
            alert('Error renaming item: ' + result.error);
        }
    }



    async deleteItem(itemPath, itemName) {
        const confirmed = confirm(`Are you sure you want to delete "${itemName}"?`);
        if (!confirmed) return;

        const result = await ipcRenderer.invoke('delete-item', itemPath);
        
        if (result.success) {
            this.refreshFileTree();
        } else {
            alert('Error deleting item: ' + result.error);
        }
    }

    copyItem(itemPath) {
        this.clipboard = { type: 'copy', path: itemPath };
    }

    cutItem(itemPath) {
        this.clipboard = { type: 'cut', path: itemPath };
    }

    async pasteItem(targetPath) {
        if (!this.clipboard) return;

        const sourcePath = this.clipboard.path;
        const sourceName = path.basename(sourcePath);
        const destinationPath = path.join(targetPath, sourceName);

        if (this.clipboard.type === 'copy') {
            // Use the proper copy operation
            const result = await ipcRenderer.invoke('copy-item', sourcePath, destinationPath);
            if (result.success) {
                this.refreshFileTree();
            } else {
                alert('Error copying item: ' + result.error);
            }
        } else if (this.clipboard.type === 'cut') {
            const result = await ipcRenderer.invoke('move-item', sourcePath, destinationPath);
            if (result.success) {
                this.clipboard = null;
                this.refreshFileTree();
            } else {
                alert('Error moving item: ' + result.error);
            }
        }
    }

    async deleteMultipleItems() {
        const selectedPaths = Array.from(this.selectedItems);
        const itemNames = selectedPaths.map(path => path.split('/').pop()).join(', ');
        
        if (confirm(`Are you sure you want to delete ${selectedPaths.length} item${selectedPaths.length > 1 ? 's' : ''}?\n\n${itemNames}`)) {
            let successCount = 0;
            let errorCount = 0;
            
            for (const itemPath of selectedPaths) {
                const result = await ipcRenderer.invoke('delete-item', itemPath);
                if (result.success) {
                    successCount++;
                } else {
                    errorCount++;
                    console.error(`Error deleting ${itemPath}:`, result.error);
                }
            }
            
            if (errorCount > 0) {
                alert(`Deleted ${successCount} item${successCount > 1 ? 's' : ''}, failed to delete ${errorCount} item${errorCount > 1 ? 's' : ''}`);
            }
            
            this.refreshFileTree();
            this.deselectAllItems();
        }
    }

    copyMultipleItems() {
        const selectedPaths = Array.from(this.selectedItems);
        this.clipboard = { type: 'copy', paths: selectedPaths };
    }

    cutMultipleItems() {
        const selectedPaths = Array.from(this.selectedItems);
        this.clipboard = { type: 'cut', paths: selectedPaths };
    }

    // Drag and Drop handlers
    handleDragStart(e, item) {
        this.draggedItem = item;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.path);
    }

    handleDragOver(e, item) {
        if (this.draggedItem && this.draggedItem.path !== item.path) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    }

    handleDragEnter(e, item) {
        if (this.draggedItem && this.draggedItem.path !== item.path && item.isDirectory) {
            e.currentTarget.classList.add('drag-over');
        }
    }

    handleDragLeave(e, item) {
        e.currentTarget.classList.remove('drag-over');
    }

    async handleDrop(e, item) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');

        if (!this.draggedItem || this.draggedItem.path === item.path) return;

        if (item.isDirectory) {
            const sourcePath = this.draggedItem.path;
            const sourceName = path.basename(sourcePath);
            const destinationPath = path.join(item.path, sourceName);

            const result = await ipcRenderer.invoke('move-item', sourcePath, destinationPath);
            if (result.success) {
                this.refreshFileTree();
            } else {
                alert('Error moving item: ' + result.error);
            }
        }

        this.draggedItem = null;
    }

    // Keyboard shortcuts
    handleKeyboardShortcuts(e) {
        // Handle Ctrl/Cmd + key combinations
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'c':
                    if (this.selectedItems.size > 0) {
                        e.preventDefault();
                        if (this.selectedItems.size === 1) {
                            this.copyItem(Array.from(this.selectedItems)[0]);
                        } else {
                            this.copyMultipleItems();
                        }
                    }
                    break;
                case 'x':
                    if (this.selectedItems.size > 0) {
                        e.preventDefault();
                        if (this.selectedItems.size === 1) {
                            this.cutItem(Array.from(this.selectedItems)[0]);
                        } else {
                            this.cutMultipleItems();
                        }
                    }
                    break;
                case 'v':
                    if (this.clipboard) {
                        e.preventDefault();
                        this.pasteItem(this.currentPath);
                    }
                    break;
                case 'f2':
                    if (this.selectedItems.size === 1) {
                        e.preventDefault();
                        const selectedPath = Array.from(this.selectedItems)[0];
                        const selectedName = path.basename(selectedPath);
                        this.startRename(selectedPath, selectedName);
                    }
                    break;
                case 'a':
                    e.preventDefault();
                    this.selectAllItems();
                    break;
            }
        }
        
        // Handle keys without Ctrl/Cmd
        switch (e.key) {
            case 'Delete':
                if (this.selectedItems.size > 0) {
                    e.preventDefault();
                    if (this.selectedItems.size === 1) {
                        const selectedPath = Array.from(this.selectedItems)[0];
                        const selectedName = path.basename(selectedPath);
                        this.deleteItem(selectedPath, selectedName);
                    } else {
                        this.deleteMultipleItems();
                    }
                }
                break;
            case 'Backspace':
                if (this.selectedItems.size > 0) {
                    e.preventDefault();
                    if (this.selectedItems.size === 1) {
                        const selectedPath = Array.from(this.selectedItems)[0];
                        const selectedName = path.basename(selectedPath);
                        this.deleteItem(selectedPath, selectedName);
                    } else {
                        this.deleteMultipleItems();
                    }
                }
                break;
            case 'Enter':
                if (this.selectedItems.size === 1) {
                    e.preventDefault();
                    const selectedPath = Array.from(this.selectedItems)[0];
                    const selectedItem = this.selectedItem;
                    if (selectedItem && selectedItem.isDirectory) {
                        this.openFolder(selectedItem);
                    } else if (selectedItem) {
                        this.openFile(selectedItem);
                    }
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.deselectAllItems();
                break;
        }
    }

    async refreshFileTree() {
        await this.loadFileTree();
    }
}

// Initialize the file explorer when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FileExplorer();
}); 