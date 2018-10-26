//
//  apple2e memory mamager
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%201.pdf
//       ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%202.pdf
//       ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%203.pdf
//       ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%204.pdf
//


export class Memory
{
    constructor(rom_cd, rom_ef) {
        this._rom_cd = rom_cd;
        this._rom_ef = rom_ef;

        this._main = new Uint8Array(0x10000);   // 64k
        this._main_bb = new Uint8Array(0x1000); //  4k (dxxx bank2)

        this._aux = new Uint8Array(0x10000);    // 64k
        this._aux_bb = new Uint8Array(0x1000);  //  4k (dxxx bank2)

        this._bsr_read = false;
        this._bsr_write = false;
        this._bsr_bank2 = false;

        this._aux_zp = false;
        this._aux_read = false;
        this._aux_write = false;

        this._dms_80store = false;
        this._dms_page2 = false;
        this._dms_hires = false;

        this._read_hooks = [];
        this._write_hooks = [];
    }


    get bsr_read() { return this._bsr_read; }
    set bsr_read(val) { this._bsr_read = (val!=0); }
    get bsr_write() { return this._bsr_write; }
    set bsr_write(val) { this._bsr_write = (val!=0); }
    get bsr_bank2() { return this._bsr_bank2; }
    set bsr_bank2(val) { this._bsr_bank2 = (val!=0); }

    get aux_zp() { return this._aux_zp; }
    set aux_zp(val) { this._aux_zp = (val!=0); }
    get aux_read() { return this._aux_read; }
    set aux_read(val) { this._aux_read = (val!=0); }
    get aux_write() { return this._aux_write; }
    set aux_write(val) { this._aux_write = (val!=0); }

    // tech ref p.28
    get dms_80store() { return this._dms_80store; }
    set dms_80store(val) { this._dms_80store = (val!=0); }
    get dms_page2() { return this._dms_page2; }
    set dms_page2(val) { this._dms_page2 = (val!=0); }
    get dms_hires() { return this._dms_hires; }
    set dms_hires(val) { this._dms_hires = (val!=0); }


    read(addr) {
        addr &= 0xffff;

        for(let read_hook of this._read_hooks) {
            const res = read_hook(addr);
            if(res != undefined) return res & 0xff;
        }

        // 0000-01ff
        if(addr < 0x0200) {
            return this._aux_zp ? this._aux[addr] : this._main[addr];
        }

        if(this._dms_80store) {
            // 0400-07ff
            if((addr & 0xfc00) == 0x0400) {
                return this._dms_page2 ? this._aux[addr] : this._main[addr];
            }

            // 2000-3fff
            if(this._dms_hires && ((addr & 0xe000) == 0x2000)) {
                return this._dms_page2 ? this._aux[addr] : this._main[addr];
            }
        }

        // 0200-bfff
        if(addr < 0xc000) {
            return this._aux_read ? this._aux[addr] : this._main[addr];
        }

        // c000-cfff
        if((addr & 0xf000) == 0xc000) {
            return this._rom_cd[addr & 0x0fff];
        }

        // d000-ffff (filter above): bank switched ram
        // ram read
        if(this._bsr_read) {
            // d000-dfff: bank 2 read
            if(this._bsr_bank2 && ((addr & 0xf000) == 0xd000)) {
                return this._aux_zp ? this._aux_bb[addr & 0x0fff] : this._main_bb[addr & 0x0fff];
            }
            // d000-dfff bank 1 & e000-ffff
            return this._aux_zp ? this._aux[addr] : this._main[addr];
        }

        // rom read
        // d000-dfff: read dxxx rom
        if((addr & 0xf000) == 0xd000) return this._rom_cd[(addr & 0x0fff) | 0x1000];
        // e000-ffff: read ef rom
        return this._rom_ef[addr & 0x1fff];
    }

    // little-endian read
    read_word(addr) {
        return this.read(addr) | this.read(addr+1)<<8;
    }


    write(addr, val) {
        addr &= 0xffff;
        val &= 0xff;

        for(let write_hook of this._write_hooks) {
            const res = write_hook(addr, val);
            if(res != undefined) return;
        }

        // 0000-01ff
        if(addr < 0x0200) {
            if(this._aux_zp) {
                this._aux[addr] = val;
            } else {
                this._main[addr] = val;
            }
            return;
        }

        if(this._dms_80store) {
            // 0400-07ff
            if((addr & 0xfc00) == 0x0400) {
                if(this._dms_page2) {
                    this._aux[addr] = val;
                } else {
                    this._main[addr] = val;
                }
                return;
            }
            // 2000-3fff
            if(this._dms_hires && ((addr & 0xe000) == 0x2000)) {
                if(this._dms_page2) {
                    this._aux[addr] = val;
                } else {
                    this._main[addr] = val;
                }
                return;
            }
        }

        // 0200-bfff
        if(addr < 0xc000) {
            if(this._aux_write) {
                this._aux[addr] = val;
            } else {
                this._main[addr] = val;
            }
            return;
        }

        // c000-cfff || d000-ffff (discard writes to rom areas)
        if(((addr & 0xf000) == 0xc000) || !this._bsr_write) return;

        // d000-ffff (filter above): bank switched ram

        // d000-dfff: bank 2 write
        if(this._bsr_bank2 && ((addr & 0xf000) == 0xd000)) {
            // write dxxx bank2 (aux a & b)
            if(this._aux_zp) {
                this._aux_bb[addr & 0x0fff] = val;
            } else {
                this._main_bb[addr & 0x0fff] = val;
            }
            return;
        }
        // d000-dfff bank 1 & e000-ffff
        if(this._aux_zp) {
            this._aux[addr] = val;
        } else {
            this._main[addr] = val;
        }
    }

    // memory read callback hook
    //   function(addr)
    //   return undefined to contunue processing
    add_read_hook(callback) {
        if(!this._read_hooks.includes(callback)) {
            this._read_hooks.push(callback);
        }
    }
    remove_read_hook(callback) {
        if(this._read_hooks.includes(callback)) {
            this._read_hooks = this._read_hooks.filter(e => e !== callback);
        }
    }

    // memory write callback hook
    //   function(addr, val))
    //   return undefined to contunue processing
    add_write_hook(callback) {
        if(!this._write_hooks.includes(callback)) {
            this._write_hooks.push(callback);
        }
    }
    remove_write_hook(callback) {
        if(this._write_hooks.includes(callback)) {
            this._write_hooks = this._write_hooks.filter(e => e !== callback);
        }
    }

    fill(val, addr_begin, addr_end) {
        val &= 0xff;
        addr_begin &= 0xffff;
        addr_end &= 0xffff;
        for(let addr=addr_begin; addr<=addr_end; addr++) {
            this.write(addr, val);
        }
    }

    reset() {
        this._main.fill(0);
        this._main_bb.fill(0);
        this._aux.fill(0);
        this._aux_bb.fill(0);

        this._bsr_read = false;
        this._bsr_write = false;
        this._bsr_bank2 = false;

        this._aux_zp = false;
        this._aux_read = false;
        this._aux_write = false;

        this._dms_80store = false;
        this._dms_page2 = false;
        this._dms_hires = false;
    }

    // export data range in hexdump format
    hexdump(addr_begin, addr_end, ascii) {
        addr_begin &= 0xffff;
        addr_end &= 0xffff;

        let out = "";
        for(let i=addr_begin; i<=addr_end; i+=16) {
            let row = i.toString(16).padStart(4, '0') + "  ";
            let asc = "";
            for(let j=i; j<i+16; j++) {
                if(j <= addr_end) {
                    const val = this.read(j);
                    row += val.toString(16).padStart(2, '0') + " ";
                    asc += val<0x20 || val>0x7e && val<0xc0 || val==0xf7 ? "." : String.fromCharCode(val);
                }
                else {
                    row += "   ";
                    asc += " ";
                }
                if(j == i+7) row += " ";
            }
            if(ascii) {
                out += " " + row + " |" + asc + "|\n";
            }
            else {
                out += " " + row + "\n";
            }
        }
        return out;
    }
}
