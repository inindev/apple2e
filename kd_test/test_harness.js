//
// Test harness for W65C02S emulator using Klaus Dormann functional tests
//
// This loads a 6502 binary test program into memory and runs it
// The test succeeds when the program counter reaches a specific address
// and stays there (infinite loop at success address)
//

import { W65C02S } from '../w65c02s.js';

class TestMemory {
    constructor() {
        this.ram = new Uint8Array(65536);
    }

    read(addr) {
        return this.ram[addr & 0xffff];
    }

    write(addr, val) {
        this.ram[addr & 0xffff] = val & 0xff;
    }

    read_word(addr) {
        const lo = this.read(addr);
        const hi = this.read((addr + 1) & 0xffff);
        return (hi << 8) | lo;
    }

    // Load a binary file into memory at specified address
    loadBinary(data, startAddr = 0x0000) {
        for (let i = 0; i < data.length; i++) {
            this.ram[(startAddr + i) & 0xffff] = data[i];
        }
    }
}

class TestRunner {
    constructor(config) {
        this.config = {
            loadAddress: config.loadAddress || 0x0000,
            startAddress: config.startAddress || 0x0400,
            successAddress: config.successAddress || 0x3469,  // Klaus test default
            maxCycles: config.maxCycles || 100000000,
            progressInterval: config.progressInterval || 100000,
            breakpoint: config.breakpoint // Optional breakpoint
        };

        this.memory = new TestMemory();
        this.cpu = new W65C02S(this.memory);
        this.running = false;
        this.stopRequested = false;
        this.traceLog = new Array(50).fill(null);
        this.traceIndex = 0;
    }

    loadTest(binaryData) {
        this.memory.loadBinary(binaryData, this.config.loadAddress);
        this.cpu.register.pc = this.config.startAddress;

        console.log(`Test loaded at 0x${this.config.loadAddress.toString(16)}`);
        console.log(`Starting execution at 0x${this.config.startAddress.toString(16)}`);
        console.log(`Success address: 0x${this.config.successAddress.toString(16)}`);
    }

    stop() {
        this.stopRequested = true;
    }

    async run(progressCallback) {
        this.running = true;
        this.stopRequested = false;

        let cycles = 0;
        let lastPC = -1;
        let stuckCount = 0;
        const STUCK_THRESHOLD = 10;
        let lastProgressUpdate = 0;

        // Run in chunks to keep UI responsive
        const runChunk = () => {
            const CHUNK_SIZE = 10000;

            for (let i = 0; i < CHUNK_SIZE && cycles < this.config.maxCycles; i++) {
                if (this.stopRequested) {
                    this.running = false;
                    return {
                        success: false,
                        cycles: cycles,
                        finalPC: this.cpu.register.pc,
                        message: 'Test stopped by user',
                        registers: this.getRegisterState()
                    };
                }

                const pc = this.cpu.register.pc;

                // Check breakpoint
                if (this.config.breakpoint !== undefined && pc === this.config.breakpoint) {
                    this.running = false;
                    return {
                        success: false,
                        cycles: cycles,
                        finalPC: pc,
                        message: `Breakpoint reached at 0x${pc.toString(16).padStart(4, '0')}`,
                        registers: this.getRegisterState(),
                        memoryContext: this.getMemoryContext(pc),
                        trace: this.getTrace()
                    };
                }

                // Check if we're stuck at the success address
                if (pc === this.config.successAddress) {
                    if (lastPC === pc) {
                        stuckCount++;
                        if (stuckCount >= STUCK_THRESHOLD) {
                            this.running = false;
                            return {
                                success: true,
                                cycles: cycles,
                                finalPC: pc,
                                message: 'All tests passed!',
                                registers: this.getRegisterState()
                            };
                        }
                    } else {
                        stuckCount = 0;
                    }
                } else {
                    stuckCount = 0;
                }

                // Check if we're stuck at a different address (test failure)
                if (lastPC === pc && pc !== this.config.successAddress) {
                    stuckCount++;
                    if (stuckCount >= STUCK_THRESHOLD) {
                        this.running = false;
                        const opcode = this.memory.read(pc);
                        return {
                            success: false,
                            cycles: cycles,
                            finalPC: pc,
                            message: `Test FAILED - stuck at 0x${pc.toString(16).padStart(4, '0')}`,
                            registers: this.getRegisterState(),
                            stuckOpcode: opcode,
                            memoryContext: this.getMemoryContext(pc),
                            trace: this.getTrace()
                        };
                    }
                }

                lastPC = pc;

                // Record trace
                this.traceLog[this.traceIndex] = {
                    pc: pc,
                    opcode: this.memory.read(pc),
                    a: this.cpu.register.a,
                    x: this.cpu.register.x,
                    y: this.cpu.register.y,
                    sp: this.cpu.register.sp,
                    p: this.cpu.register.flag.value
                };
                this.traceIndex = (this.traceIndex + 1) % this.traceLog.length;

                // Execute one instruction
                const opcode = this.memory.read(pc);
                const opfn = this.cpu.op[opcode];

                if (!opfn) {
                    this.running = false;
                    const opcode = this.memory.read(pc);
                    return {
                        success: false,
                        cycles: cycles,
                        finalPC: pc,
                        message: `Invalid opcode 0x${opcode.toString(16).padStart(2, '0')} at 0x${pc.toString(16).padStart(4, '0')}`,
                        registers: this.getRegisterState(),
                        stuckOpcode: opcode,
                        memoryContext: this.getMemoryContext(pc),
                        trace: this.getTrace()
                    };
                }

                this.cpu.register.pc++;
                const cyclesUsed = opfn();
                cycles += cyclesUsed;

                // Progress update
                if (cycles - lastProgressUpdate >= this.config.progressInterval) {
                    lastProgressUpdate = cycles;
                    if (progressCallback) {
                        progressCallback(cycles, pc);
                    }
                }
            }

            // Continue in next chunk or timeout
            if (cycles >= this.config.maxCycles) {
                this.running = false;
                const opcode = this.memory.read(this.cpu.register.pc);
                return {
                    success: false,
                    cycles: cycles,
                    finalPC: this.cpu.register.pc,
                    message: 'Test timeout - exceeded maximum cycles',
                    registers: this.getRegisterState(),
                    stuckOpcode: opcode,
                    memoryContext: this.getMemoryContext(this.cpu.register.pc),
                    trace: this.getTrace()
                };
            }

            // Schedule next chunk
            return null;
        };

        // Run chunks asynchronously
        return new Promise((resolve) => {
            const runNextChunk = () => {
                const result = runChunk();
                if (result !== null) {
                    resolve(result);
                } else {
                    setTimeout(runNextChunk, 0);
                }
            };
            runNextChunk();
        });
    }

    getRegisterState() {
        const r = this.cpu.register;
        return {
            A: `0x${r.a.toString(16).padStart(2, '0')}`,
            X: `0x${r.x.toString(16).padStart(2, '0')}`,
            Y: `0x${r.y.toString(16).padStart(2, '0')}`,
            SP: `0x${r.sp.toString(16).padStart(2, '0')}`,
            PC: `0x${r.pc.toString(16).padStart(4, '0')}`,
            Flags: {
                N: r.flag.n,
                V: r.flag.v,
                B: r.flag.b,
                D: r.flag.d,
                I: r.flag.i,
                Z: r.flag.z,
                C: r.flag.c
            }
        };
    }

    getMemoryContext(pc) {
        // Show 16 bytes around the PC
        const bytes = [];
        for (let i = -8; i < 8; i++) {
            const addr = (pc + i) & 0xffff;
            bytes.push({
                addr: `0x${addr.toString(16).padStart(4, '0')}`,
                value: `0x${this.memory.read(addr).toString(16).padStart(2, '0')}`,
                isPC: i === 0
            });
        }
        return bytes;
    }

    getTrace() {
        const result = [];
        // Reorder trace from circular buffer
        for (let i = 0; i < this.traceLog.length; i++) {
            const index = (this.traceIndex + i) % this.traceLog.length;
            const entry = this.traceLog[index];
            if (entry) {
                result.push(entry);
            }
        }
        return result;
    }
}

export { TestRunner, TestMemory };
