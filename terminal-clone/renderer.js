import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const term = new Terminal({
    fontSize: 14,
    cursorBlink: true,
    theme: {
        background: '#000000',
        foreground: '#ffffff',
    }
});
const fitAddon = new FitAddon();

term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();

window.electronAPI.startTerminal();

window.electronAPI.onTerminalData(data => {
    term.write(data);
});

term.onData(data => {
    window.electronAPI.sendInput(data);
});

const resizeTerminal = () => {
    fitAddon.fit();
    window.electronAPI.sendResize({ cols: term.cols, rows: term.rows });
};

window.addEventListener('resize', resizeTerminal);

// Initial resize to sync PTY size
resizeTerminal();

// Observe #terminal size changes and fit terminal
const terminalElement = document.getElementById('terminal');
const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    window.electronAPI.sendResize({ cols: term.cols, rows: term.rows });
});
resizeObserver.observe(terminalElement);
