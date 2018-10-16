//
//  apple2e 5.25" floppy disk drive emulator
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: ftp://ftp.apple.asimov.net/pub/apple_II/documentation/os/dos/Beneath%20Apple%20DOS%20-%204th%20Ed.pdf
//       ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Laser%20128%20Series%20Technical%20Reference%20Manual.pdf
//
//  13 sector roms (p5 boot code, p6 state machine)
//     ftp://ftp.apple.asimov.net/pub/apple_II/emulators/rom_images/Apple%20Disk%20II%2013%20Sector%20Interface%20Card%20ROM%20P5%20-%20341-0009.bin
//     ftp://ftp.apple.asimov.net/pub/apple_II/emulators/rom_images/Apple%20Disk%20II%2013%20Sector%20Interface%20Card%20ROM%20P6%20-%20341-0010.bin
//  16 sector roms (p5 boot code, p6 state machine)
//     ftp://ftp.apple.asimov.net/pub/apple_II/emulators/rom_images/Apple%20Disk%20II%2016%20Sector%20Interface%20Card%20ROM%20P5%20-%20341-0027.bin
//     ftp://ftp.apple.asimov.net/pub/apple_II/emulators/rom_images/Apple%20Disk%20II%2016%20Sector%20Interface%20Card%20ROM%20P6%20-%20341-0028.bin
//

import {disk16_p5_rom_341_0027} from "./rom/disk16-p5_341-0027.js";
import {disk16_p6_rom_341_0028} from "./rom/disk16-p6_341-0028.js";


export class Floppy525
{
    constructor(slot, memory, led_cb) {
        this._slot = (slot & 0x07);
        this._mem = memory;
        this._led_cb = led_cb; // cb(drive:0/1, state:t/f)

        this._addr_sel = 0xc080 | (this._slot << 4);  // eg c0e0
        this._addr_io = 0xc000 | (this._slot << 8);   // eg c600

        this._mem.add_read_hook(this.read.bind(this));
        this._mem.add_write_hook(this.write.bind(this));

        this._num = 0;
        this._write_protect = false;

        this._write_disk = false;
        this._data_latch = 0;
    }


    ////////////////////////////////////////////
    read(addr) {
        if((addr & 0xf800) != 0xc000) return undefined; // default read

        // slot select
        if((addr & 0xfff0) == this._addr_sel) {
            return this.select(addr & 0x000f, false);
        }

        // cx00-cxff
        if((addr & 0xff00) == this._addr_io) {
            //console.log("read p5 rom: " + (addr & 0xff));
            return disk16_p5_rom_341_0027[addr & 0xff];
        }
    }


    ////////////////////////////////////////////
    write(addr, val) {
        if((addr & 0xf800) != 0xc000) return undefined; // default write

        // slot select
        if((addr & 0xfff0) == this._addr_sel) {
            return this.select(addr & 0x000f, true);
        }

        // cx00-cxff
        if((addr & 0xff00) == this._addr_io) {
            return 0; // write handled
        }
    }


    // slot select p.6-2
    select(op, io_write) {
        //if(op & 0x08) console.log("slot " + this._slot + " select - io " + (io_write?"write":"read") + ", op: " + op.toString(16));
        switch(op) {
            case 0x08: // motor off
            case 0x09: // motor on
                this._led_cb(this._num, (op & 0x01) != 0);
                break;
            case 0x0a: // engage drive 1
            case 0x0b: // engage drive 2
                this._num = op & 0x01;
                break;
            case 0x0c: // data strobe (q6l)
                if(this._write_disk) {
                    console.log("strobe: place byte into latch: " + val);
                } else {
                    console.log("strobe: read byte from latch");
                }
                break;
            case 0x0d: // latch data (q6h)
                if(io_write) {  // i/o write
                } else {        // i/o read
                    if(this._write_disk) {
                        this._data_latch = val; // put byte in data latch
                    }
                }
                break;
            case 0x0e: // latch is input (q7l)
                this._write_disk = false;
                break;
            case 0x0f: // latch is output (q7h)
                this._write_disk = true;
                break;
            default: // 0-7
                // ascending: inward / descending: outward
                const phase_on = op & 0x01;
                const phase_num = (op >> 1) & 0x03;
                break;
        }

        return 0;
    }


    reset() {
        this._num = 0;
        this._write_protect = false;

        this._write_disk = false;
        this._data_latch = 0;

        this._led_cb(0, false);
        this._led_cb(1, false);
    }
}
