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


class Memory
{
    constructor(rom_cd, rom_ef) {
        this.rom_cd = rom_cd;
        this.rom_ef = rom_ef;

        this.main = new Uint8Array(0x10000);   // 64k
        this.main_b2 = new Uint8Array(0x1000); //  4k (d000 bank 2)

        this.aux = new Uint8Array(0x10000);    // 64k
        this.aux_b2 = new Uint8Array(0x1000);  //  4k (d000 bank 2)

        // fn(addr)
        this.read_hooks = [];
        // fn(addr, val)
        this.write_hooks = [];
    }

    read(addr) {
        addr &= 0xffff;

        for(let read_hook of this.read_hooks) {
            const res = read_hook(addr);
            if(res != undefined) return res & 0xff;
        }

        if(addr > 0xdfff) return this.rom_ef[addr & 0x1fff];
        if(addr > 0xbfff) return this.rom_cd[addr & 0x1fff];

        return this.main[addr & 0xffff];
    }

    // little-endian read
    read_word(addr) {
        return this.read(addr) | this.read(addr+1)<<8;
    }

    write(addr, val) {
        addr &= 0xffff;
        val &= 0xff;

        for(let write_hook of this.write_hooks) {
            const res = write_hook(addr, val);
            if(res != undefined) return;
        }

        this.main[addr] = val;
    }

    // memory read callback hook
    //   function(addr)
    //   return undefined to contunue processing
    add_read_hook(callback) {
        if(!this.read_hooks.includes(callback)) {
            this.read_hooks.push(callback);
        }
    }
    remove_read_hook(callback) {
        if(this.read_hooks.includes(callback)) {
            this.read_hooks = this.read_hooks.filter(e => e !== callback);
        }
    }

    // memory write callback hook
    //   function(addr, val))
    //   return undefined to contunue processing
    add_write_hook(callback) {
        if(!this.write_hooks.includes(callback)) {
            this.write_hooks.push(callback);
        }
    }
    remove_write_hook(callback) {
        if(this.write_hooks.includes(callback)) {
            this.write_hooks = this.write_hooks.filter(e => e !== callback);
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
        this.main.fill(0);
        this.main_b2.fill(0);
        this.aux.fill(0);
        this.aux_b2.fill(0);
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
