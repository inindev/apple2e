# Klaus Dormann 6502 Test Suite

This directory contains a test harness for running Klaus Dormann's comprehensive 6502/65C02 functional tests against the W65C02S emulator.

## Overview

The test suite validates the emulator by executing Klaus Dormann's exhaustive test binaries, which exercise all instructions, addressing modes, and flag behaviors. A successful test run executes approximately 88 million cycles and validates correct CPU behavior.

## Quick Start

### 1. Download Test Binaries

The test binaries are not included in this repository. Download them from the [Klaus Dormann test repository](https://github.com/Klaus2m5/6502_65C02_functional_tests):

```bash
cd kd_test

# Download 6502 functional test
wget https://github.com/Klaus2m5/6502_65C02_functional_tests/raw/refs/heads/master/bin_files/6502_functional_test.bin

# Download 65C02 extended opcodes test
wget https://github.com/Klaus2m5/6502_65C02_functional_tests/raw/refs/heads/master/bin_files/65C02_extended_opcodes_test.bin
```

**Note:** The `.bin` files are git-ignored to keep the repository clean.

### 2. Start the Web Server

From the repository root directory:

```bash
sh http_server.sh
```

This will start a local HTTP server on port 8000.

### 3. Open the Test Harness

Navigate to: **http://localhost:8000/kd_test**

## Running Tests

### Basic Test Execution

1. **Load Binary**: Click "Load Binary" and select a test file (e.g., `6502_functional_test.bin`)
2. **Configure Settings** (optional):
   - **Load Address**: Where to load the binary in memory (default: `0000`)
   - **Start Address**: Where to begin execution (default: `0400`)
   - **Success Address**: PC address indicating test completion (default: `3469`)
   - **Max Cycles**: Maximum cycles before timeout (default: `100000000`)
3. **Run Test**: Click "Run Test" and wait for completion

### Test Results

- **✓ SUCCESS**: All tests passed - the emulator is functioning correctly
- **✗ FAILURE**: Test failed at a specific address (see failure details below)

On failure, the harness displays:
- The instruction opcode where execution got stuck
- Register state (A, X, Y, SP, PC, flags)
- Memory context around the failing PC
- Execution trace (last 50 instructions)

### Available Tests

| Test File | Description | Success Address |
|-----------|-------------|-----------------|
| `6502_functional_test.bin` | Core 6502 instruction test | `0x3469` |
| `65C02_extended_opcodes_test.bin` | 65C02-specific opcodes | `0x24F1` |

Update the "Success Address" field when testing different binaries.

## How the Tests Work

The Klaus Dormann test suite is written in 6502 assembly and runs directly on the "bare metal" of the emulator. It does not output text to a console. Instead, it communicates status through the **Program Counter (PC)**:

### Test Execution Flow

1. **Sequential Validation**: Tests validate instructions one by one (e.g., checking if `LDA #$00` correctly sets the Zero flag)
2. **Failure Mode**: If a test fails, the program enters an **infinite loop at the failure address** - it effectively "hangs" where the bug was detected
3. **Success Mode**: If **all** tests pass, the program jumps to the success address (e.g., `0x3469`) and loops there forever

### Interpreting Results

- **✓ SUCCESS**: PC reached the success address and stayed there (~88 million cycles for full test)
- **✗ FAILURE**: Emulator got stuck at a different address
  - **Stuck Address**: Indicates which test failed - earlier addresses mean basic instructions are broken
  - **Stuck Opcode**: The instruction that triggered the trap

## Advanced Features

### Breakpoints

Set a breakpoint to pause execution at a specific address:
- Enter address in **Breakpoint** field (e.g., `0x09D7`)
- Run test - execution stops at breakpoint
- View register state and memory context

### Memory Tools

**Peek** - Read memory contents:
- Enter address (e.g., `0x0100`)
- Enter length in bytes (default: 16)
- Click "Peek" to display values

**Poke** - Write to memory:
- Enter address (e.g., `0x0100`)
- Enter byte value (e.g., `0xFF`)
- Click "Poke" to write

Useful for debugging or setting up custom test conditions.

## Test Configuration Details

### 6502 Functional Test
```
Load Address:    0x0000
Start Address:   0x0400
Success Address: 0x3469
Expected Cycles: ~88 million
Expected Time:   15-20 seconds
```

### 65C02 Extended Opcodes Test
```
Load Address:    0x0000
Start Address:   0x0400
Success Address: 0x24F1
Expected Cycles: ~10 million
Expected Time:   2-3 seconds
```

## Troubleshooting

**Test times out**: Increase "Max Cycles" value

**Wrong success address**: Check that the success address matches the binary you loaded

**Browser feels slow**: The test runs in chunks to keep UI responsive, but 88M cycles takes time - be patient

**Test fails**: The emulator has a bug! Check the failure details:
- Stuck opcode shows which instruction failed
- Execution trace shows the instruction sequence leading to failure
- Memory context shows the bytes around the failing PC

## How It Works

The test harness:
1. Loads the binary test program into emulated memory
2. Sets PC to the start address
3. Executes instructions using the W65C02S emulator's `step()` method
4. Monitors for success conditions:
   - PC reaches the success address and stays there (infinite loop = pass)
   - PC gets stuck at a different address (test failure)
   - Invalid opcode encountered
   - Maximum cycles exceeded (timeout)

## Credits

Test binaries created by Klaus Dormann: https://github.com/Klaus2m5/6502_65C02_functional_tests

These tests are the gold standard for validating 6502/65C02 emulators and have helped identify countless bugs across many emulator implementations.
