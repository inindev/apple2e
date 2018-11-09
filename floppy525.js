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
//
//  16 sector roms (p5 boot code, p6 state machine)
//     ftp://ftp.apple.asimov.net/pub/apple_II/emulators/rom_images/Apple%20Disk%20II%2016%20Sector%20Interface%20Card%20ROM%20P5%20-%20341-0027.bin
//     ftp://ftp.apple.asimov.net/pub/apple_II/emulators/rom_images/Apple%20Disk%20II%2016%20Sector%20Interface%20Card%20ROM%20P6%20-%20341-0028.bin
//
//
//  5 and 3 encoding
//    35 tracks
//    13 sectors per track
//    https://en.wikipedia.org/wiki/Group_coded_recording#5_and_3
//
//  6 and 2 encoding
//    35 tracks
//    16 sectors per track
//    https://en.wikipedia.org/wiki/Group_coded_recording#6_and_2
//


import {disk16_p5_rom_341_0027} from "./rom/disk16-p5_341-0027.js";
//import {disk16_p6_rom_341_0028} from "./rom/disk16-p6_341-0028.js";

// ProDOS_2_4_2.dsk 8596-85d6
const write_62 = [
    0x96,0x97,0x9a,0x9b,0x9d,0x9e,0x9f,0xa6,0xa7,0xab,0xac,0xad,0xae,0xaf,0xb2,0xb3,
    0xb4,0xb5,0xb6,0xb7,0xb9,0xba,0xbb,0xbc,0xbd,0xbe,0xbf,0xcb,0xcd,0xce,0xcf,0xd3,
    0xd6,0xd7,0xd9,0xda,0xdb,0xdc,0xdd,0xde,0xdf,0xe5,0xe6,0xe7,0xe9,0xea,0xeb,0xec,
    0xed,0xee,0xef,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf9,0xfa,0xfb,0xfc,0xfd,0xfe,0xff
];

// ProDOS_2_4_2.dsk 8d2b-8d3b
const sec_int = [0x00,0x0d,0x0b,0x09,0x07,0x05,0x03,0x01,0x0e,0x0c,0x0a,0x08,0x06,0x04,0x02,0x0f];


class Disk
{
    constructor(num, led_cb) {
        this.num = num;
        this.led_cb = led_cb;

        this.name = "";
        this.write_protect = false;

        this.track_num = 0;
        this.track_offs = 0;
        this.tracks = [];
        this.phase_num_last = 0;
    }

    read() {
        const track = this.tracks[this.track_num >> 1]; // even tracks
        if(!track || !track.length) return 0;
        if(this.track_offs >= track.length) this.track_offs = 0;
        return track[this.track_offs++];
    }

    set_phase(phase_num) {
        // ascending: inward / descending: outward
        const delta = phase_num - this.phase_num_last;
        this.phase_num_last = phase_num;
        this.track_num += (delta < -2) ? 1 : ((delta > 2) ? -1 : delta);
        if(this.track_num < 0) this.track_num = 0;
        else if(this.track_num > 69) this.track_num = 69; // 70 positions possible
        this.track_offs = 0;
    }

    set_led(state) {
        this.led_cb(this.num, state != 0);
    }

    reset() {
        this.led_cb(this.num, false);
    }
}


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

        this._disks = [new Disk(0, led_cb), new Disk(1, led_cb)];
        this._active_disk = this._disks[0];
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
        switch(op) {
            case 0x08: // motors off
                this._disks[0].set_led(false);
                this._disks[1].set_led(false);
                break;
            case 0x09: // selected drive motor on
                this._active_disk.set_led(true);
                break;
            case 0x0a: // engage drive 1
                this._disks[1].set_led(false);
                this._disks[0].set_led(true);
                this._active_disk = this._disks[0];
                break;
            case 0x0b: // engage drive 2
                this._disks[0].set_led(false);
                this._disks[1].set_led(true);
                this._active_disk = this._disks[1];
                break;
            case 0x0c: // data strobe (q6l)
                if(!io_write) return this._active_disk.read();
//                if(this._write_disk) {
//                    console.log("strobe: place byte into latch: " + val);
//                } else {
//                    console.log("strobe: read byte from latch");
//                }
                break;
            case 0x0d: // latch data (q6h)
                if(io_write) {  // i/o write
                } else {        // i/o read
//                    if(this._write_disk) {
//                        this._data_latch = val; // put byte in data latch
//                    }
                }
                break;
            case 0x0e: // latch is input (q7l)
            case 0x0f: // latch is output (q7h)
                this._write_disk = (op & 0x01) != 0;
                break;
            default: // 0-7
                if(op & 0x01) this._active_disk.set_phase((op >> 1) & 0x03);
                break;
        }

        return 0;
    }


    load_disk(num, name, bin) {
        console.log("loading disk " + (num+1) + ": " + name);
        if(bin.byteLength != 143360) {
            console.log("error, invalid disk image size: " + bin.length);
            return false;
        }
        const src = new Uint8Array(bin);

        this._disks[num].name = name;
        for(let t=0; t<35; t++) {
            let track = [];
            for(let s=15; s>=0; s--) {
                track = track.concat(this.sector_62encode(src, t, s));
            }
            this._disks[num].tracks[t] = new Uint8Array(track); // 6288 bytes, pack the array
        }

        return true;
    }


    sector_62encode(src, trk, sec_ni) {
        // gap 3
        // TODO: is 128 needed for sector 0 gap1?
        // ffff-ffff 00ff-ffff ff00-ffff ffff-00ff ffff-ff00
        let res = [0xff,0x3f,0xcf,0xf3,0xfc,0xff,0x3f,0xcf,0xf3,0xfc,0xff,0x3f,0xcf,0xf3,0xfc,0xff,0x3f,0xcf,0xf3,0xfc];

        // address (14)
        const vol = 0xfe;
        const sec = sec_int[sec_ni];
        const csum = vol ^ trk ^ sec;
        res = res.concat([0xd5,0xaa,0x96]); // address prolog
        res = res.concat([(vol>>1)|0xaa, vol|0xaa]);
        res = res.concat([(trk>>1)|0xaa, trk|0xaa]);
        res = res.concat([(sec>>1)|0xaa, sec|0xaa]);
        res = res.concat([(csum>>1)|0xaa, csum|0xaa]);
        res = res.concat([0xde,0xaa,0xeb]); // epilog

        // gap2
        res = res.concat([0xff,0x3f,0xcf,0xf3,0xfc,0xff,0x3f,0xcf,0xf3,0xfc]);

        // data
        res = res.concat([0xd5,0xaa,0xad]); // data prolog
        const data62 = [];
        const offs = (trk << 12) | (sec_ni << 8);
        for(let i=255, i2=83; i>=0; i--, i2=i%86) {
            const val = src[i + offs];
            data62[i+86] = val >> 2;
            data62[i2] = (data62[i2] << 2) | ((val & 0x01) << 1) | ((val & 0x02) >> 1);
        }
        let last_val = 0;
        for(let i=0; i<342; i++) {
            const val = data62[i];
            res.push(write_62[val ^ last_val]);
            last_val = val;
        }
        res.push(write_62[last_val]);
        res = res.concat([0xde,0xaa,0xeb]); // epilog

        return res;
    }


    reset() {
        this._disks[0].reset();
        this._disks[1].reset();
        this._active_disk = this._disks[0];
    }
}

