//
// UI controller for the test harness
//

import { TestRunner } from './test_harness.js';

class TestUI {
    constructor() {
        this.runner = null;
        this.binaryData = null;

        // Get UI elements
        this.loadBtn = document.getElementById('loadBtn');
        this.fileInput = document.getElementById('fileInput');
        this.runBtn = document.getElementById('runBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusDiv = document.getElementById('status');
        this.progressDiv = document.getElementById('progress');
        this.resultsDiv = document.getElementById('results');

        // Configuration inputs
        this.loadAddrInput = document.getElementById('loadAddr');
        this.startAddrInput = document.getElementById('startAddr');
        this.successAddrInput = document.getElementById('successAddr');
        this.successAddrInput = document.getElementById('successAddr');
        this.maxCyclesInput = document.getElementById('maxCycles');
        this.breakpointInput = document.getElementById('breakpoint');

        // Memory Tool inputs
        this.peekAddrInput = document.getElementById('peekAddr');
        this.peekLenInput = document.getElementById('peekLen');
        this.peekBtn = document.getElementById('peekBtn');
        this.pokeAddrInput = document.getElementById('pokeAddr');
        this.pokeValInput = document.getElementById('pokeVal');
        this.pokeBtn = document.getElementById('pokeBtn');
        this.memoryOutput = document.getElementById('memoryOutput');

        this.setupEventListeners();
        this.updateButtonStates();
    }

    setupEventListeners() {
        this.loadBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileLoad(e));
        this.runBtn.addEventListener('click', () => this.runTest());
        this.stopBtn.addEventListener('click', () => this.stopTest());
        this.peekBtn.addEventListener('click', () => this.handlePeek());
        this.pokeBtn.addEventListener('click', () => this.handlePoke());
    }

    updateButtonStates() {
        this.runBtn.disabled = !this.binaryData || (this.runner && this.runner.running);
        this.stopBtn.disabled = !this.runner || !this.runner.running;
    }

    async handleFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.setStatus(`Loading ${file.name}...`, 'info');

        try {
            const arrayBuffer = await file.arrayBuffer();
            this.binaryData = new Uint8Array(arrayBuffer);

            // Auto-detect test type from filename and set success address
            const filename = file.name.toLowerCase();
            if (filename.includes('65c02') && filename.includes('extended')) {
                this.successAddrInput.value = '24f1';
                this.setStatus(`Loaded ${file.name} (${this.binaryData.length} bytes) - 65C02 extended opcodes test detected`, 'success');
            } else if (filename.includes('6502') && filename.includes('functional')) {
                this.successAddrInput.value = '3469';
                this.setStatus(`Loaded ${file.name} (${this.binaryData.length} bytes) - 6502 functional test detected`, 'success');
            } else {
                this.setStatus(`Loaded ${file.name} (${this.binaryData.length} bytes)`, 'success');
            }

            this.updateButtonStates();
        } catch (error) {
            this.setStatus(`Error loading file: ${error.message}`, 'error');
        }
    }

    async runTest() {
        if (!this.binaryData) return;

        // Get configuration
        const config = {
            loadAddress: parseInt(this.loadAddrInput.value, 16),
            startAddress: parseInt(this.startAddrInput.value, 16),
            successAddress: parseInt(this.successAddrInput.value, 16),
            maxCycles: parseInt(this.maxCyclesInput.value),
            breakpoint: this.parseInput(this.breakpointInput.value),
            progressInterval: 100000
        };

        // Create runner and load test
        this.runner = new TestRunner(config);
        this.runner.loadTest(this.binaryData);

        this.setStatus('Running test...', 'info');
        this.resultsDiv.innerHTML = '';
        this.updateButtonStates();

        const startTime = Date.now();

        // Run with progress updates
        const result = await this.runner.run((cycles, pc) => {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.progressDiv.textContent =
                `Cycles: ${cycles.toLocaleString()} | PC: 0x${pc.toString(16).padStart(4, '0')} | Time: ${elapsed}s`;
        });

        // Display results
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        this.displayResults(result, elapsed);
        this.updateButtonStates();
    }

    stopTest() {
        if (this.runner) {
            this.runner.stop();
            this.setStatus('Stopping test...', 'warning');
        }
    }

    displayResults(result, elapsed) {
        const statusClass = result.success ? 'success' : 'error';
        this.setStatus(result.message, statusClass);

        let html = '<div class="result-box">';
        html += `<h3>${result.success ? '✓ SUCCESS' : '✗ FAILURE'}</h3>`;
        html += `<p><strong>Cycles executed:</strong> ${result.cycles.toLocaleString()}</p>`;
        html += `<p><strong>Time elapsed:</strong> ${elapsed}s</p>`;
        html += `<p><strong>Final PC:</strong> 0x${result.finalPC.toString(16).padStart(4, '0')}</p>`;

        if (result.registers) {
            html += '<h4>Register State:</h4>';
            html += '<div class="registers">';
            html += `<div>A: ${result.registers.A}</div>`;
            html += `<div>X: ${result.registers.X}</div>`;
            html += `<div>Y: ${result.registers.Y}</div>`;
            html += `<div>SP: ${result.registers.SP}</div>`;
            html += `<div>PC: ${result.registers.PC}</div>`;
            html += '</div>';

            html += '<h4>Flags:</h4>';
            html += '<div class="flags">';
            const flags = result.registers.Flags;
            for (const [flag, value] of Object.entries(flags)) {
                html += `<span class="${value ? 'flag-set' : 'flag-clear'}">${flag}:${value ? '1' : '0'}</span>`;
            }
            html += '</div>';
        }

        // Show stuck opcode and memory context for failures
        if (!result.success && result.stuckOpcode !== undefined) {
            html += '<h4>Stuck Instruction:</h4>';
            html += `<p>Opcode at PC: <code>0x${result.stuckOpcode.toString(16).padStart(2, '0')}</code></p>`;

            if (result.memoryContext) {
                html += '<h4>Memory Around PC:</h4>';
                html += '<div class="memory-dump">';
                result.memoryContext.forEach(byte => {
                    const className = byte.isPC ? 'memory-byte pc-byte' : 'memory-byte';
                    html += `<div class="${className}">${byte.addr}: ${byte.value}</div>`;
                });
                html += '</div>';
            }

            if (result.trace) {
                html += '<h4>Execution Trace (Last 50 Instructions):</h4>';
                html += '<div style="overflow-x: auto;">';
                html += '<table style="width: 100%; border-collapse: collapse; font-family: monospace; font-size: 12px;">';
                html += '<thead style="background: #f0f0f0;"><tr>';
                html += '<th style="text-align: left; padding: 4px; border: 1px solid #ddd;">PC</th>';
                html += '<th style="text-align: left; padding: 4px; border: 1px solid #ddd;">Op</th>';
                html += '<th style="text-align: left; padding: 4px; border: 1px solid #ddd;">A</th>';
                html += '<th style="text-align: left; padding: 4px; border: 1px solid #ddd;">X</th>';
                html += '<th style="text-align: left; padding: 4px; border: 1px solid #ddd;">Y</th>';
                html += '<th style="text-align: left; padding: 4px; border: 1px solid #ddd;">SP</th>';
                html += '<th style="text-align: left; padding: 4px; border: 1px solid #ddd;">NV-BDIZC</th>';
                html += '</tr></thead><tbody>';

                result.trace.forEach(entry => {
                    const flags = entry.p;
                    // Format flags string
                    const fStr =
                        ((flags & 0x80) ? 'N' : '-') +
                        ((flags & 0x40) ? 'V' : '-') +
                        '-' +
                        ((flags & 0x10) ? 'B' : '-') +
                        ((flags & 0x08) ? 'D' : '-') +
                        ((flags & 0x04) ? 'I' : '-') +
                        ((flags & 0x02) ? 'Z' : '-') +
                        ((flags & 0x01) ? 'C' : '-');

                    html += '<tr>';
                    html += `<td style="padding: 2px 4px; border: 1px solid #ddd;">0x${entry.pc.toString(16).padStart(4, '0')}</td>`;
                    html += `<td style="padding: 2px 4px; border: 1px solid #ddd;">0x${entry.opcode.toString(16).padStart(2, '0')}</td>`;
                    html += `<td style="padding: 2px 4px; border: 1px solid #ddd;">0x${entry.a.toString(16).padStart(2, '0')}</td>`;
                    html += `<td style="padding: 2px 4px; border: 1px solid #ddd;">0x${entry.x.toString(16).padStart(2, '0')}</td>`;
                    html += `<td style="padding: 2px 4px; border: 1px solid #ddd;">0x${entry.y.toString(16).padStart(2, '0')}</td>`;
                    html += `<td style="padding: 2px 4px; border: 1px solid #ddd;">0x${entry.sp.toString(16).padStart(2, '0')}</td>`;
                    html += `<td style="padding: 2px 4px; border: 1px solid #ddd;">${fStr}</td>`;
                    html += '</tr>';
                });
                html += '</tbody></table></div>';
            }
        }

        html += '</div>';
        this.resultsDiv.innerHTML = html;
    }

    setStatus(message, type = 'info') {
        this.statusDiv.textContent = message;
        this.statusDiv.className = `status ${type}`;
    }

    // Helper to parse input values
    parseInput(value) {
        if (!value) return null;
        value = value.trim();
        if (value.startsWith('0x') || value.startsWith('0X')) {
            return parseInt(value.substring(2), 16);
        }
        return parseInt(value, 10);
    }

    handlePeek() {
        if (!this.runner) {
            this.memoryOutput.textContent = 'Error: No test loaded/runner not initialized.';
            return;
        }

        const addr = this.parseInput(this.peekAddrInput.value);
        let len = this.parseInput(this.peekLenInput.value);

        if (addr === null || isNaN(addr)) {
            this.memoryOutput.textContent = 'Error: Invalid address.';
            return;
        }
        if (len === null || isNaN(len)) {
            len = 16; // default
        }

        let output = '';
        for (let i = 0; i < len; i++) {
            const val = this.runner.memory.read((addr + i) & 0xffff);
            output += `0x${val.toString(16).padStart(2, '0').toUpperCase()} `;
        }
        this.memoryOutput.textContent = `Peek at 0x${addr.toString(16).padStart(4, '0').toUpperCase()}: ${output}`;
    }

    handlePoke() {
        if (!this.runner) {
            this.memoryOutput.textContent = 'Error: No test loaded/runner not initialized.';
            return;
        }

        const addr = this.parseInput(this.pokeAddrInput.value);
        const val = this.parseInput(this.pokeValInput.value);

        if (addr === null || isNaN(addr)) {
            this.memoryOutput.textContent = 'Error: Invalid address.';
            return;
        }
        if (val === null || isNaN(val)) {
            this.memoryOutput.textContent = 'Error: Invalid value.';
            return;
        }

        this.runner.memory.write(addr & 0xffff, val & 0xff);
        this.memoryOutput.textContent = `Wrote 0x${val.toString(16).padStart(2, '0').toUpperCase()} to 0x${addr.toString(16).padStart(4, '0').toUpperCase()}`;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TestUI();
});
