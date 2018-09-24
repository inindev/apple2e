//
//  apple2e ram emulation
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//

class RAM
{
    constructor(bytes) {
        this.u8a = new Uint8Array(bytes || 0x10000);

        this.read_hook_addr_begin = 0;
        this.read_hook_addr_end = 0;
        this.read_hook_callback = null;

        this.write_hook_addr_begin = 0;
        this.write_hook_addr_end = 0;
        this.write_hook_callback = null;

        this._strobe;
    }

    read(addr) {
        addr &= 0xffff;
        if((addr >= this.read_hook_addr_begin) && (addr <= this.read_hook_addr_end) && (typeof this.read_hook_callback === "function")) {
            return this.read_hook_callback(addr) & 0xff;
        }
        return this.u8a[addr & 0xffff];
    }

    // little endian read
    read_word(addr) {
        return this.read(addr) | this.read(addr+1)<<8;
    }

    write(addr, val) {
        addr &= 0xffff;

        // strobe
        if(this._strobe && (addr == 0xc010)) {
            this._strobe();
            return;
        }

        this.u8a[addr] = val;
        if((addr >= this.write_hook_addr_begin) && (addr <= this.write_hook_addr_end) && (typeof this.write_hook_callback === "function")) {
            this.write_hook_callback(addr, (val & 0xff));
        }
    }

    // memory read callback hook
    //   read_hook(0xfe, 0xfe, function(addr))
    //   set callback to null to clear
    read_hook(addr_begin, addr_end, callback) {
        if( (typeof callback !== "function") ||
            (addr_begin < 0) ||
            (addr_begin > addr_end) ||
            (addr_end >= this.u8a.length) )
        {
            this.read_hook_addr_begin = 0;
            this.read_hook_addr_end = 0;
            this.read_hook_callback = null;
            return;
        }

        this.read_hook_addr_begin = addr_begin;
        this.read_hook_addr_end = addr_end;
        this.read_hook_callback = callback;
    }

    // memory write callback hook
    //   write_hook(0x0200, 0x5ff, function(addr, val))
    //   set callback to null to clear
    write_hook(addr_begin, addr_end, callback) {
        if( (typeof callback !== "function") ||
            (addr_begin < 0) ||
            (addr_begin > addr_end) ||
            (addr_end >= this.u8a.length) )
        {
            this.write_hook_addr_begin = 0;
            this.write_hook_addr_end = 0;
            this.write_hook_callback = null;
            return;
        }

        this.write_hook_addr_begin = addr_begin;
        this.write_hook_addr_end = addr_end;
        this.write_hook_callback = callback;
    }

    // TODO: need formal IO class
    set strobe(val) { this._strobe = val; }

    apply(offs, arr) {
        arr.map((v, i) => { this.write(offs+i, v); });
    }

    fill(val, addr_begin, addr_end) {
        this.u8a.fill(val, addr_begin, addr_end + 1);
    }

    reset() {
        this.u8a.fill(0);
    }

    // export data range in hexdump format
    hexdump(addr_begin, addr_end, ascii) {
        addr_begin = addr_begin || 0;
        addr_end = addr_end || u8Array.length-1;

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
