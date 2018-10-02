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


class HiresDisplay
{
    constructor(canvas, lines) {
        canvas.width = 564;  // 7*2*40 + 4
        canvas.height = 388; // 8*2*24 + 4
        this.context = canvas.getContext('2d', {alpha: false});
        this.context.imageSmoothingEnabled = true;
        this.context.imageSmoothingQuality = "high";

        // color palette
        this.violet = 0xff22dd;
        this.blue   = 0x2222ff;
        this.green  = 0x11dd00;
        this.orange = 0xff6600;
        this.black  = 0x111111; // almost black
        this.white  = 0xffffff;

        // horizontal scan line color
        this.violet_hscan = 55;
        this.blue_hscan   = 55;
        this.green_hscan  = 55;
        this.orange_hscan = 55;
        this.black_hscan  = 100;  // scan lines do not look good on black
        this.white_hscan  = 55;

        // vertical scan line color
        this.violet_vscan = 77;
        this.blue_vscan   = 77;
        this.green_vscan  = 77;
        this.orange_vscan = 77;
        this.black_vscan  = 100;
        this.white_vscan  = 100;

        this._hlines = false;
        this._vlines = true;

        this.reset();
    }

    get hlines() { return this._hlines; }
    set hlines(val) { this._hlines = (val != 0); }
    get vlines() { return this._vlines; }
    set vlines(val) { this._vlines = (val != 0); }


    get_color_fcn(rgb, hscan, vscan) {
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;

        const rhs = Math.floor((r * hscan) / 100);
        const ghs = Math.floor((g * hscan) / 100);
        const bhs = Math.floor((b * hscan) / 100);

        const rvs = Math.floor((r * vscan) / 100);
        const gvs = Math.floor((g * vscan) / 100);
        const bvs = Math.floor((b * vscan) / 100);

        return (data, col, x) => {
            let draw = true;
            if(this._hlines) {
                // in a horizontal scan bar
                data[x]   = data[x+4] = r;
                data[x+1] = data[x+5] = g;
                data[x+2] = data[x+6] = b;
                data[x+56] = data[x+60] = rhs;
                data[x+57] = data[x+61] = ghs;
                data[x+58] = data[x+62] = bhs;
                draw = false;
            }

            if(this._vlines && ((col + (x>>3)) & 0x01)) {
                // in a vertical scan bar
                data[x]   = data[x+4] = data[x+56] = data[x+60] = rvs;
                data[x+1] = data[x+5] = data[x+57] = data[x+61] = gvs;
                data[x+2] = data[x+6] = data[x+58] = data[x+62] = bvs;
                draw = false;
            }

            if(draw) {
                // regular color
                data[x]   = data[x+4] = data[x+56] = data[x+60] = r;
                data[x+1] = data[x+5] = data[x+57] = data[x+61] = g;
                data[x+2] = data[x+6] = data[x+58] = data[x+62] = b;
            }
        };
    }


    init_color_table() {
        const fviolet = this.get_color_fcn(this.violet, this.violet_hscan, this.violet_vscan);
        const fblue   = this.get_color_fcn(this.blue,   this.blue_hscan,   this.blue_vscan);
        const fgreen  = this.get_color_fcn(this.green,  this.green_hscan,  this.green_vscan);
        const forange = this.get_color_fcn(this.orange, this.orange_hscan, this.orange_vscan);
        const fblack  = this.get_color_fcn(this.black,  this.black_hscan,  this.black_vscan);
        const fwhite  = this.get_color_fcn(this.white,  this.white_hscan,  this.white_vscan);

        // green / violet   000     001      010     011     100      101     110     111
        const group1e = [fblack, fblack, fgreen,  fwhite, fblack, fviolet, fwhite, fwhite];
        const group1o = [fblack, fblack, fviolet, fwhite, fblack, fgreen,  fwhite, fwhite];
        // orange / blue    000     001      010     011     100      101     110     111
        const group2e = [fblack, fblack, forange, fwhite, fblack, fblue,   fwhite, fwhite];
        const group2o = [fblack, fblack, fblue,   fwhite, fblack, forange, fwhite, fwhite];

        this.group1 = [group1e, group1o];
        this.group2 = [group2e, group2o];
    }


    draw(ram, addr, val) {
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
        //   2) violet: 55 2a 55 2a -> 0101:0101 0010:1010 -> 0+10101010101010
        //   3) white1: 7f 7f 7f 7f -> 0111:1111 0111:1111 -> 0+11111111111111
        //
        // group 2                     v         v
        //   4) black2: 80 80 80 80 -> 1000 0000 1000 0000 -> 1+00000000000000
        //   5) orange: aa d5 aa d5 -> 1010 1010 1101 0101 -> 1+01010101010101
        //   6) blue  : d5 aa d5 aa -> 1101 0101 1010 1010 -> 1+10101010101010
        //   7) white2: ff ff ff ff -> 1111 1111 1111 1111 -> 1+11111111111111
        const color_group = (val & 0x80) ? this.group2 : this.group1;

        // pixels are evaluated in three bit groups, this requires evaluating
        // a total of nine bits to produce 7 pixels of output (one column)
        // if the screen is drawn left-to-right, the extra bits can be taken
        // from the two msbs of the previous column (or zero for the first column)
        //
        //       +v+  -> pix6
        // 876543210
        //      +v+   -> pix5
        // 876543210
        //     +v+    -> pix4
        // 876543210
        //    +v+     -> pix3
        // 876543210
        //   +v+      -> pix2
        // 876543210
        //  +v+       -> pix1
        // 876543210
        // +v+        -> pix0
        // 876543210
        const prev = (col < 1) ? 0 : ram.read(addr-1);
        const orig = val;
        val = (val << 2) | ((prev >> 5) & 0x03);

        // row: 0-191, col: 0-39
        const ox = (col * 14) + 1;
        const oy = (row * 2) + 2;

        const id = this.context.getImageData(ox, oy, 14, 2);

        let oe = (col & 0x01);
        for(let x=0; x<56; x+=8) {
            color_group[oe][val & 0x07](id.data, col, x);
            val >>= 1;
            oe ^= 1;
        }

        this.context.putImageData(id, ox, oy, 0, 0, 14, 2);
    }


    reset() {
        this.init_color_table();
        const r = (this.black >> 16) & 0xff;
        const g = (this.black >> 8) & 0xff;
        const b = this.black & 0xff;
        const id = this.context.createImageData(564, 388);
        const imax = 564 * 388 * 4; // (560+4, 384+4) * rgba
        for(let i=0; i<imax; i+=4) {
            id.data[i]   = r;
            id.data[i+1] = g;
            id.data[i+2] = b;
            id.data[i+3] = 0xff;
        }
        this.context.putImageData(id, 0, 0);
    }
}
