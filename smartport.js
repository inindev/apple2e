//
//  apple2e smartport hard disk controller
//
//  Copyright 2026, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: https://prodos8.com/docs/technote/smartport/01
//       https://prodos8.com/docs/technote/smartport/02
//       https://prodos8.com/docs/technote/smartport/04
//       https://prodos8.com/docs/technote/smartport/06
//       https://prodos8.com/docs/technote/21
//       https://prodos8.com/docs/techref/adding-routines-to-prodos
//


const MAX_DRIVES = 2;


class SmartPortDrive
{
    constructor(num) {
        this.num = num;
        this.name = "";
        this.data = null;          // Uint8Array of raw image data
        this.block_count = 0;      // number of 512-byte blocks
        this.data_offset = 0;      // byte offset to block 0 (0 for raw, varies for 2mg)
        this.write_protect = false;
        this.mounted = false;
    }
}


export class SmartPort
{
    constructor(slot, memory, cpu, led_cb) {
        this._slot = (slot & 0x07);
        this._mem = memory;
        this._cpu = cpu;
        this._led_cb = led_cb;  // cb(drive:0/1, state:t/f)

        this._addr_sel = 0xc080 | (this._slot << 4);  // slot i/o: $C0F0 for slot 7
        this._addr_rom = 0xc000 | (this._slot << 8);  // slot rom: $C700 for slot 7

        this._rom = this._build_rom();

        this._drives = [new SmartPortDrive(0), new SmartPortDrive(1)];

        this._mem.add_read_hook(this.read.bind(this));
        this._mem.add_write_hook(this.write.bind(this));
    }


    ////////////////////////////////////////////
    read(addr) {
        if((addr & 0xf800) != 0xc000) return undefined;  // not i/o space

        // soft switch reads $C0F0-$C0FF
        if((addr & 0xfff0) == this._addr_sel) {
            return 0;
        }

        // slot rom $Cn00-$CnFF - only serve if a drive is mounted
        if((addr & 0xff00) == this._addr_rom) {
            if(!this._drives[0].mounted && !this._drives[1].mounted) return undefined;
            return this._rom[addr & 0xff];
        }

        return undefined;
    }


    ////////////////////////////////////////////
    write(addr, val) {
        if((addr & 0xf800) != 0xc000) return undefined;

        // soft switch writes $C0F0-$C0FF
        if((addr & 0xfff0) == this._addr_sel) {
            const reg = addr & 0x0f;
            if(reg === 0x00) {
                this._exec_prodos();    // $C0F0: prodos block dispatch
            } else if(reg === 0x01) {
                this._exec_smartport(); // $C0F1: smartport dispatch
            }
            return 0;  // write handled
        }

        // slot rom area - absorb writes
        if((addr & 0xff00) == this._addr_rom) {
            return 0;
        }

        return undefined;
    }


    ////////////////////////////////////////////
    // prodos block device dispatch
    //   triggered by STA $C0F0 at $Cn80
    //   params in zero page $42-$47
    //   PC is at $Cn83 (past the STA), skip to RTS at $Cn86
    _exec_prodos() {
        const reg = this._cpu.register;
        const mem = this._mem;

        const cmd = mem.read(0x42);
        const unit = mem.read(0x43);    // DSSS0000: D=drive, SSS=slot
        const buf = mem.read(0x44) | (mem.read(0x45) << 8);
        const block = mem.read(0x46) | (mem.read(0x47) << 8);

        const drive_num = (unit >> 7) & 1;  // bit 7 = drive (0 or 1)
        const sp_unit = drive_num + 1;      // smartport units are 1-based

        let error;
        switch(cmd) {
            case 0x00: // status
                error = this._prodos_status(drive_num);
                break;
            case 0x01: // read
                error = this._sp_read_block(sp_unit, buf, block);
                break;
            case 0x02: // write
                error = this._sp_write_block(sp_unit, buf, block);
                break;
            case 0x03: // format
                error = this._sp_format(sp_unit);
                break;
            default:
                error = 0x01; // bad command
        }

        this._set_result(error);

        // skip PC past the smartport STA to the shared RTS
        reg.pc = this._addr_rom | 0x86;
    }


    ////////////////////////////////////////////
    // smartport dispatch
    //   triggered by STA $C0F1 at $Cn83
    //   inline params follow the caller's JSR: cmd(1) + param_ptr(2)
    //   PC is already at $Cn86 (RTS)
    _exec_smartport() {
        const reg = this._cpu.register;
        const mem = this._mem;

        // read return address from stack (JSR pushed PC-1)
        const sp = reg.sp;
        const ret_lo = mem.read(0x0100 | ((sp + 1) & 0xff));
        const ret_hi = mem.read(0x0100 | ((sp + 2) & 0xff));
        const ret_addr = (ret_hi << 8) | ret_lo;

        // inline parameters start at ret_addr + 1
        const cmd = mem.read((ret_addr + 1) & 0xffff);
        const param_lo = mem.read((ret_addr + 2) & 0xffff);
        const param_hi = mem.read((ret_addr + 3) & 0xffff);
        const param_ptr = (param_hi << 8) | param_lo;

        // adjust return address on stack to skip 3 inline bytes
        // RTS will add 1 to popped address, so store (ret_addr + 3)
        const new_ret = (ret_addr + 3) & 0xffff;
        mem.write(0x0100 | ((sp + 1) & 0xff), new_ret & 0xff);
        mem.write(0x0100 | ((sp + 2) & 0xff), (new_ret >> 8) & 0xff);

        // read parameter list
        const unit = mem.read((param_ptr + 1) & 0xffff);

        let error;
        switch(cmd) {
            case 0x00: // status
                error = this._sp_status(unit, param_ptr);
                break;
            case 0x01: // read block
                error = this._sp_read_block_params(unit, param_ptr);
                break;
            case 0x02: // write block
                error = this._sp_write_block_params(unit, param_ptr);
                break;
            case 0x03: // format
                error = this._sp_format(unit);
                break;
            case 0x04: // control
                error = 0x01;  // not implemented
                break;
            case 0x05: // init
                error = this._sp_init(unit);
                break;
            default:
                error = 0x01;  // bad command
        }

        this._set_result(error);
        // PC is already at $Cn86 (RTS) - no adjustment needed
    }


    ////////////////////////////////////////////
    _set_result(error_code) {
        const reg = this._cpu.register;
        // set X and Y first (for STATUS), then A (sets N/Z based on error), then carry
        reg.a = error_code;
        reg.flag.c = (error_code !== 0);
    }


    ////////////////////////////////////////////
    // prodos block status: return block count in X/Y
    _prodos_status(drive_num) {
        const drive = this._drives[drive_num];
        if(!drive || !drive.mounted) return 0x28;  // no device connected

        const reg = this._cpu.register;
        reg.x = drive.block_count & 0xff;
        reg.y = (drive.block_count >> 8) & 0xff;
        return 0x00;
    }


    ////////////////////////////////////////////
    // smartport STATUS (cmd $00)
    _sp_status(unit, param_ptr) {
        const mem = this._mem;
        const status_ptr = mem.read((param_ptr + 2) & 0xffff) |
                          (mem.read((param_ptr + 3) & 0xffff) << 8);
        const status_code = mem.read((param_ptr + 4) & 0xffff);

        // unit 0: controller status
        if(unit === 0) {
            if(status_code !== 0x00) return 0x21;  // bad status code
            let count = 0;
            for(let i = 0; i < MAX_DRIVES; i++) {
                if(this._drives[i].mounted) count = i + 1;
            }
            mem.write(status_ptr, count);
            this._cpu.register.x = count;
            this._cpu.register.y = 0;
            return 0x00;
        }

        // unit N: device status
        const drive = this._drives[unit - 1];
        if(!drive || unit > MAX_DRIVES || !drive.mounted) return 0x28;

        if(status_code === 0x00) {
            // general status: 4 bytes
            const status_byte = drive.write_protect ? 0xbc : 0xf8;
            mem.write(status_ptr, status_byte);
            mem.write((status_ptr + 1) & 0xffff, drive.block_count & 0xff);
            mem.write((status_ptr + 2) & 0xffff, (drive.block_count >> 8) & 0xff);
            mem.write((status_ptr + 3) & 0xffff, (drive.block_count >> 16) & 0xff);
            this._cpu.register.x = drive.block_count & 0xff;
            this._cpu.register.y = (drive.block_count >> 8) & 0xff;
            return 0x00;
        }

        if(status_code === 0x03) {
            // device information block: 25 bytes
            const status_byte = drive.write_protect ? 0xbc : 0xf8;
            mem.write(status_ptr, status_byte);
            mem.write((status_ptr + 1) & 0xffff, drive.block_count & 0xff);
            mem.write((status_ptr + 2) & 0xffff, (drive.block_count >> 8) & 0xff);
            mem.write((status_ptr + 3) & 0xffff, (drive.block_count >> 16) & 0xff);
            // device name (pascal string)
            const name = "SMARTPORT" + unit;
            mem.write((status_ptr + 4) & 0xffff, name.length);
            for(let i = 0; i < 16; i++) {
                mem.write((status_ptr + 5 + i) & 0xffff, i < name.length ? name.charCodeAt(i) : 0x20);
            }
            mem.write((status_ptr + 21) & 0xffff, 0x02);  // device type: ProFile
            mem.write((status_ptr + 22) & 0xffff, 0x00);  // device subtype
            mem.write((status_ptr + 23) & 0xffff, 0x01);  // firmware version major
            mem.write((status_ptr + 24) & 0xffff, 0x00);  // firmware version minor
            return 0x00;
        }

        return 0x21;  // bad status code
    }


    ////////////////////////////////////////////
    // smartport READ BLOCK - extract params then call shared impl
    _sp_read_block_params(unit, param_ptr) {
        const mem = this._mem;
        const buf = mem.read((param_ptr + 2) & 0xffff) |
                   (mem.read((param_ptr + 3) & 0xffff) << 8);
        const block = mem.read((param_ptr + 4) & 0xffff) |
                     (mem.read((param_ptr + 5) & 0xffff) << 8) |
                     (mem.read((param_ptr + 6) & 0xffff) << 16);
        return this._sp_read_block(unit, buf, block);
    }

    // shared read block implementation (prodos + smartport)
    _sp_read_block(unit, buf, block) {
        const drive_idx = unit - 1;
        if(drive_idx < 0 || drive_idx >= MAX_DRIVES) return 0x28;
        const drive = this._drives[drive_idx];
        if(!drive.mounted) return 0x28;
        if(block >= drive.block_count) return 0x27;

        if(this._led_cb) this._led_cb(drive_idx, true);

        const offset = drive.data_offset + (block * 512);
        for(let i = 0; i < 512; i++) {
            this._mem.write((buf + i) & 0xffff, drive.data[offset + i]);
        }

        if(this._led_cb) this._led_cb(drive_idx, false);
        return 0x00;
    }


    ////////////////////////////////////////////
    // smartport WRITE BLOCK - extract params then call shared impl
    _sp_write_block_params(unit, param_ptr) {
        const mem = this._mem;
        const buf = mem.read((param_ptr + 2) & 0xffff) |
                   (mem.read((param_ptr + 3) & 0xffff) << 8);
        const block = mem.read((param_ptr + 4) & 0xffff) |
                     (mem.read((param_ptr + 5) & 0xffff) << 8) |
                     (mem.read((param_ptr + 6) & 0xffff) << 16);
        return this._sp_write_block(unit, buf, block);
    }

    // shared write block implementation (prodos + smartport)
    _sp_write_block(unit, buf, block) {
        const drive_idx = unit - 1;
        if(drive_idx < 0 || drive_idx >= MAX_DRIVES) return 0x28;
        const drive = this._drives[drive_idx];
        if(!drive.mounted) return 0x28;
        if(drive.write_protect) return 0x2b;
        if(block >= drive.block_count) return 0x27;

        if(this._led_cb) this._led_cb(drive_idx, true);

        const offset = drive.data_offset + (block * 512);
        for(let i = 0; i < 512; i++) {
            drive.data[offset + i] = this._mem.read((buf + i) & 0xffff);
        }

        if(this._led_cb) this._led_cb(drive_idx, false);
        return 0x00;
    }


    ////////////////////////////////////////////
    _sp_format(unit) {
        const drive_idx = unit - 1;
        if(drive_idx < 0 || drive_idx >= MAX_DRIVES || !this._drives[drive_idx].mounted) return 0x28;
        return 0x00;
    }

    _sp_init(unit) {
        const drive_idx = unit - 1;
        if(drive_idx < 0 || drive_idx >= MAX_DRIVES || !this._drives[drive_idx].mounted) return 0x28;
        return 0x00;
    }


    ////////////////////////////////////////////
    load_image(num, name, bin) {
        if(num < 0 || num >= MAX_DRIVES) return false;
        console.log("loading smartport drive " + (num + 1) + ": " + name);

        const src = new Uint8Array(bin);
        const drive = this._drives[num];

        // detect 2IMG format by magic bytes
        if(src.length >= 64 &&
           src[0] === 0x32 && src[1] === 0x49 &&
           src[2] === 0x4d && src[3] === 0x47) {  // "2IMG"
            const block_count = src[0x14] | (src[0x15] << 8) |
                               (src[0x16] << 16) | (src[0x17] << 24);
            const data_offset = src[0x18] | (src[0x19] << 8) |
                               (src[0x1a] << 16) | (src[0x1b] << 24);
            const flags = src[0x10] | (src[0x11] << 8) |
                         (src[0x12] << 16) | (src[0x13] << 24);

            drive.data = src;
            drive.data_offset = data_offset;
            drive.block_count = block_count;
            drive.write_protect = (flags & 0x80000000) !== 0;
        } else {
            // raw block image (.po, .hdv)
            if(src.length % 512 !== 0) {
                console.log("error: image size not a multiple of 512: " + src.length);
                return false;
            }
            drive.data = src;
            drive.data_offset = 0;
            drive.block_count = Math.floor(src.length / 512);
            drive.write_protect = false;
        }

        drive.name = name;
        drive.mounted = true;
        return true;
    }


    ////////////////////////////////////////////
    // build 256-byte slot rom
    _build_rom() {
        const rom = new Uint8Array(256);
        const n = this._slot;
        const cn = 0xc0 | n;
        const io_lo = (0x80 | (n << 4)) & 0xff;  // $F0 for slot 7

        // $00-$07: prodos/smartport id bytes (LDA #imm operands)
        rom[0x00] = 0xa9; rom[0x01] = 0x20;      // LDA #$20  ($Cn01 = $20)
        rom[0x02] = 0xa9; rom[0x03] = 0x00;      // LDA #$00  ($Cn03 = $00)
        rom[0x04] = 0xa9; rom[0x05] = 0x03;      // LDA #$03  ($Cn05 = $03)
        rom[0x06] = 0xa9; rom[0x07] = 0x00;      // LDA #$00  ($Cn07 = $00)

        // $08-$1F: boot setup - read block 0 into $0800
        rom[0x08] = 0xa9; rom[0x09] = 0x01;      // LDA #$01     cmd = READ
        rom[0x0a] = 0x85; rom[0x0b] = 0x42;      // STA $42
        rom[0x0c] = 0xa9; rom[0x0d] = n<<4;      // LDA #$s0     unit = slot << 4
        rom[0x0e] = 0x85; rom[0x0f] = 0x43;      // STA $43
        rom[0x10] = 0xa9; rom[0x11] = 0x00;      // LDA #$00     buf lo
        rom[0x12] = 0x85; rom[0x13] = 0x44;      // STA $44
        rom[0x14] = 0xa9; rom[0x15] = 0x08;      // LDA #$08     buf hi = $0800
        rom[0x16] = 0x85; rom[0x17] = 0x45;      // STA $45
        rom[0x18] = 0xa9; rom[0x19] = 0x00;      // LDA #$00     blk lo
        rom[0x1a] = 0x85; rom[0x1b] = 0x46;      // STA $46
        rom[0x1c] = 0xa9; rom[0x1d] = 0x00;      // LDA #$00     blk hi
        rom[0x1e] = 0x85; rom[0x1f] = 0x47;      // STA $47

        // $20-$2A: call block read, then boot
        rom[0x20] = 0x20;                        // JSR $Cn80
        rom[0x21] = 0x80;
        rom[0x22] = cn;
        rom[0x23] = 0xb0; rom[0x24] = 0x05;      // BCS +5 ($2A) error path
        rom[0x25] = 0xa2; rom[0x26] = n<<4;      // LDX #$s0     boot convention
        rom[0x27] = 0x4c; rom[0x28] = 0x01;      // JMP $0801
        rom[0x29] = 0x08;
        rom[0x2a] = 0x60;                        // RTS (error: return to monitor)

        // $80-$86: entry points
        rom[0x80] = 0x8d;                        // STA $C0F0  prodos block dispatch
        rom[0x81] = io_lo;
        rom[0x82] = 0xc0;
        rom[0x83] = 0x8d;                        // STA $C0F1  smartport dispatch
        rom[0x84] = io_lo + 1;
        rom[0x85] = 0xc0;
        rom[0x86] = 0x60;                        // RTS

        // $FE-$FF: characteristics and entry offset
        rom[0xfe] = 0xf8;                        // block, r/w, online, formattable
        rom[0xff] = 0x80;                        // entry offset -> $Cn80

        return rom;
    }


    ////////////////////////////////////////////
    reset() {
        if(this._led_cb) {
            for(let i = 0; i < MAX_DRIVES; i++) {
                this._led_cb(i, false);
            }
        }
    }
}
