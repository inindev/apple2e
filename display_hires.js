//
//  apple2e hires display emulation
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
// ref: https://www.apple.asimov.net/documentation/hardware/video/
//
//     https://archive.org/download/Apple-Orchard-v1n2-1980-Fall/Apple-Orchard-v1n2-1980-Fall.pdf
//   80-Column Text Card Manual, Apple Comptiter, Inc., 1982.
//     https://www.apple.asimov.net/documentation/hardware/video/Apple%20IIe%2080-Column%20Text%20Card%20Manual.pdf
//   Extended 80-Column Text Card Supplement, Apple Computer, Inc., 1982.
//     https://www.apple.asimov.net/documentation/hardware/video/Extended%2080-Column%20Text%20Card%20Supplement%20IIe.pdf
//   Extended 80-Column Text / AppleColor Adapter Card, Apple Computer, Inc., 1984.
//     https://www.apple.asimov.net/documentation/hardware/video/Ext80ColumnAppleColorCard.pdf
//


export class HiresDisplay
{
    constructor(memory, canvas) {
        this._mem = memory;

        canvas.width = 564;  // 7*2*40 + 4
        canvas.height = 390; // 8*2*24 + 6

        this._context = canvas.getContext('2d', {alpha: false});
        this._context.imageSmoothingEnabled = false;
        this._context.webkitImageSmoothingEnabled = false;

        this._id1 = this._context.createImageData(564, 390);
        this._id2 = this._context.createImageData(564, 390);
        this._id = undefined;
        this._page1_init = false;
        this._page2_init = false;

        // when set, tjos over-rides color
        this._monochrome = 0;

        // color palette
        this.purple = 0xff22dd;
        this.blue   = 0x2222ff;
        this.green  = 0x11dd00;
        this.orange = 0xff6600;
        this.black  = 0x111111; // almost black
        this.white  = 0xeeeeee; // almost white

        // horizontal scan line color
        this.purple_hscan = 52;
        this.blue_hscan   = 52;
        this.green_hscan  = 52;
        this.orange_hscan = 52;
        this.black_hscan  = 100;  // scan lines do not look good on black
        this.white_hscan  = 52;

        // vertical scan line color
        this.purple_vscan = 72;
        this.blue_vscan   = 72;
        this.green_vscan  = 72;
        this.orange_vscan = 72;
        this.black_vscan  = 100;
        this.white_vscan  = 100;

        this._hscan = false;
        this._vscan = true;

        this.reset();
    }

    get fore() {
        return this._monochrome;
    };
    set fore(rgb) {
        this._monochrome = rgb;
        this.init_color_table();
        this.refresh();
    };

    get back() {
        return this.black;
    };
    set back(rgb) {
        this.black = rgb;
        this.init_color_table();
        this.refresh();
    };

    get hscan() { return this._hscan; }
    set hscan(val) {
        this._hscan = (val != 0);
        this.refresh();
    }

    get vscan() { return this._vscan; }
    set vscan(val) {
        this._vscan = (val != 0);
        this.refresh();
    }

    get_color_fcn(rgb, hscan, vscan) {
        let r = (rgb >> 16) & 0xff;
        let g = (rgb >> 8) & 0xff;
        let b = rgb & 0xff;

        if(this._monochrome > 0) {
            const mr = (this._monochrome >> 16) & 0xff;
            const mg = (this._monochrome >> 8) & 0xff;
            const mb = this._monochrome & 0xff;
            const bf = (0.34 * r + 0.5 * g + 0.16 * b) / 0xff;
            r = Math.floor(bf * mr);
            g = Math.floor(bf * mg);
            b = Math.floor(bf * mb);
        }

        const rhs = Math.floor((r * hscan) / 100);
        const ghs = Math.floor((g * hscan) / 100);
        const bhs = Math.floor((b * hscan) / 100);

        const rvs = Math.floor((r * vscan) / 100);
        const gvs = Math.floor((g * vscan) / 100);
        const bvs = Math.floor((b * vscan) / 100);

        return (data, oe, x) => {
            let draw = true;
            if(this._hscan) {
                data[x]   = data[x+4] = r;
                data[x+1] = data[x+5] = g;
                data[x+2] = data[x+6] = b;
                // horizontal scan bar
                data[x+2256] = data[x+2260] = rhs;
                data[x+2257] = data[x+2261] = ghs;
                data[x+2258] = data[x+2262] = bhs;
                draw = false;
            }

            if(this._vscan && !oe) {
                // vertical scan bar
                data[x]   = data[x+4] = data[x+2256] = data[x+2260] = rvs;
                data[x+1] = data[x+5] = data[x+2257] = data[x+2261] = gvs;
                data[x+2] = data[x+6] = data[x+2258] = data[x+2262] = bvs;
                draw = false;
            }

            if(draw) {
                // regular color
                data[x]   = data[x+4] = data[x+2256] = data[x+2260] = r;
                data[x+1] = data[x+5] = data[x+2257] = data[x+2261] = g;
                data[x+2] = data[x+6] = data[x+2258] = data[x+2262] = b;
            }
        };
    }

    init_color_table() {
        const fpurple = this.get_color_fcn(this.purple, this.purple_hscan, this.purple_vscan);
        const fblue   = this.get_color_fcn(this.blue,   this.blue_hscan,   this.blue_vscan);
        const fgreen  = this.get_color_fcn(this.green,  this.green_hscan,  this.green_vscan);
        const forange = this.get_color_fcn(this.orange, this.orange_hscan, this.orange_vscan);
        const fblack  = this.get_color_fcn(this.black,  this.black_hscan,  this.black_vscan);
        const fwhite  = this.get_color_fcn(this.white,  this.white_hscan,  this.white_vscan);

        // green / purple   000     001      010     011     100      101     110     111
        const group1e = [fblack, fblack, fgreen,  fwhite, fblack, fpurple, fwhite, fwhite];
        const group1o = [fblack, fblack, fpurple, fwhite, fblack, fgreen,  fwhite, fwhite];
        // orange / blue    000     001      010     011     100      101     110     111
        const group2e = [fblack, fblack, forange, fwhite, fblack, fblue,   fwhite, fwhite];
        const group2o = [fblack, fblack, fblue,   fwhite, fblack, forange, fwhite, fwhite];

        this.group1 = [group1e, group1o];
        this.group2 = [group2e, group2o];
    }

    draw(addr, val) {
        // rows are 120 columns wide consuming 128 bytes (0-119)+8
        // every 40 columns rows wrap for a total of three wraps
        // 8 rows wrapping 3 times creates a total of 24 rows
        // bits 6,5 ($60) of columns 0,40,80 yield the wrap row 0,1,2
        // bits 9,8,7 yield the 0-7 relative row number
        //
        // hires graphics repeats the above pattern eight times:
        // $0000, $0400, $0800, $0c00, $1000, $1400, $1800, $1c00
        // bits 12-10 ($1c00) of the address are the repeat number 0-7
        const col = (addr & 0x7f) % 40;  // column: 0-39
        const ac0 = addr - col;  // col 0, 40, 80 address in bits 6,5
        const row = ((ac0 << 1) & 0xc0) | ((ac0 >> 4) & 0x38) | ((ac0 >> 10) & 0x07);
        if(row > 191) return;

        // https://archive.org/download/Apple-Orchard-v1n2-1980-Fall/Apple-Orchard-v1n2-1980-Fall.pdf
        // |<--------  base byte  -------->|  +1 ---- +2  ...  +37 --- +38 --- +39  |
        // |                               :                   5 5 5 5 5 5 5 5 5 5 5|
        // |                    1 1 1 1 1 1:1 1 1 1 2 2   ...  4 5 5 5 5 5 5 5 5 5 5|
        // |0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5:6 7 8 9 0 1        9 0 1 2 3 4 5 6 7 8 9|
        // | . . . . . . . . . . . . . . . : . . . . . .      . . . . . . . . . . . |
        // |v b g o|v b g o|v b g o|v b g o|v b g o|v b        b g o|v b g o|v b g o|
        // |   0   |   1   |   2   |   3   |   4   |   5  ...  137  |  138  |  139  |
        //
        // group 1                     v         v
        //   0) black1: 00 00 00 00 -> 0000:0000 0000:0000 -> 0+00000000000000
        //   1) green : 2a 55 2a 55 -> 0010:1010 0101:0101 -> 0+01010101010101
        //   2) purple: 55 2a 55 2a -> 0101:0101 0010:1010 -> 0+10101010101010
        //   3) white1: 7f 7f 7f 7f -> 0111:1111 0111:1111 -> 0+11111111111111
        //
        // group 2                     v         v
        //   4) black2: 80 80 80 80 -> 1000 0000 1000 0000 -> 1+00000000000000
        //   5) orange: aa d5 aa d5 -> 1010 1010 1101 0101 -> 1+01010101010101
        //   6) blue  : d5 aa d5 aa -> 1101 0101 1010 1010 -> 1+10101010101010
        //   7) white2: ff ff ff ff -> 1111 1111 1111 1111 -> 1+11111111111111
        const color_group = (val & 0x80) ? this.group2 : this.group1;

        // one column is seven pixels but pixels 0 & 6 are dependent on the pixel values
        // in the adjacent columns requiring a full 9 pixel draw to prevent artifacting
        // pixels are evaluated in three bit groups, this requires evaluating a total of eleven
        // bits to produce nine pixels of output (one column with one pixel overlap each side)

        //          +v+  -> pix8 (+1)
        //  56012345601
        //         +v+   -> pix7
        //  56012345601
        //        +v+    -> pix6
        //  56012345601
        //       +v+     -> pix5
        //  56012345601
        //      +v+      -> pix4
        //  56012345601
        //     +v+       -> pix3
        //  56012345601
        //    +v+        -> pix2
        //  56012345601
        //   +v+         -> pix1
        //  56012345601
        //  +v+          -> pix0 (-1)
        //  56012345601
        //  ppcccccccnn
        const prev = (col < 1) ? 0 : this._mem.read(addr-1);
        const next = (col > 38) ? 0 : this._mem.read(addr+1);

        //     <--- read ---
        // nnnnnnncccccccppppppp
        // 654321065432106543210
        //      ^^^^^^^^^^^
        val = (next << 9) | ((val << 2) & 0x1fc) | ((prev >> 5) & 0x03);

        // row: 0-191, col: 0-39
        const ox = (col * 14) + 1;
        const oy = (row * 2) + 3;
        const lo = (ox + oy * 564) * 4;
        const id = (addr < 0x4000) ? this._id1 : this._id2;
        const data = id.data;

        let oe = col & 0x01;
        for(let x=lo, xmax=lo+72; x<xmax; x+=8) {
            color_group[oe][val & 0x07](data, oe, x);
            val >>= 1;
            oe ^= 1;
        }

        if(id == this._id) this._context.putImageData(this._id, 0, 0, ox, oy, 18, 2);
    }

    refresh() {
        if(this._id == this._id1) {
            this._id = undefined; // suspend rendering
            for(let a=0x2000; a<0x4000; a++) this.draw(a, this._mem.read(a));
            this._id = this._id1;
            this._context.putImageData(this._id, 0, 0);
        }
        else if(this._id == this._id2) {
            this._id = undefined; // suspend rendering
            for(let a=0x4000; a<0x6000; a++) this.draw(a, this._mem.read(a));
            this._id = this._id2;
            this._context.putImageData(this._id, 0, 0);
        }
    }

    set_active_page(page) {
        if(page != 2) {
            // select page 1
            if(!this._page1_init) {
                this._id = undefined; // suspend rendering
                for(let a=0x2000; a<0x4000; a++) this.draw(a, this._mem.read(a));
                this._page1_init = true;
            }
            this._id = this._id1;
        } else {
            // select page 2
            if(!this._page2_init) {
                this._id = undefined; // suspend rendering
                for(let a=0x4000; a<0x6000; a++) this.draw(a, this._mem.read(a));
                this._page2_init = true;
            }
            this._id = this._id2;
        }
        this._context.putImageData(this._id, 0, 0);
    }

    reset() {
        this.init_color_table();
        const r = (this.black >> 16) & 0xff;
        const g = (this.black >> 8) & 0xff;
        const b = this.black & 0xff;
        const imax = 564 * 390 * 4; // (560+4, 384+6) * rgba
        for(let i=0; i<imax; i+=4) {
            this._id1.data[i]   = this._id2.data[i]   = r;
            this._id1.data[i+1] = this._id2.data[i+1] = g;
            this._id1.data[i+2] = this._id2.data[i+2] = b;
            this._id1.data[i+3] = this._id2.data[i+3] = 0xff;
        }
        this._context.putImageData(this._id1, 0, 0);
        this._id = undefined;
        this._page1_init = false;
        this._page2_init = false;
    }
}

