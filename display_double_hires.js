//
//  apple2e double hires display emulation
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


export class DoubleHiresDisplay
{
    constructor(memory, canvas, hlines, vlines) {
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

        // when set, this over-rides color
        this._monochrome = 0;
        this.mpal = [];

        // apple tech notes #63: master color values, p.326
        // https://www.apple.asimov.net/documentation/misc/Apple2TechNotes1993.pdf
        // modified to soften black & white
        this.cpal = [
            [0x11,0x11,0x11], [0xdd,0x00,0x33], [0x00,0x00,0x99], [0xdd,0x22,0xdd],
            [0x00,0x77,0x22], [0x55,0x55,0x55], [0x22,0x22,0xff], [0x66,0xaa,0xff],
            [0x88,0x55,0x00], [0xff,0x66,0x00], [0xaa,0xaa,0xaa], [0xff,0x99,0x88],
            [0x11,0xdd,0x00], [0xff,0xff,0x00], [0x44,0xff,0x99], [0xee,0xee,0xee]
        ];

        this.reset();
    }

    get fore() {
        return this._monochrome;
    };
    set fore(rgb) {
        this._monochrome = rgb;
        if(rgb > 0) {
            const r = (rgb >> 16) & 0xff;
            const g = (rgb >> 8) & 0xff;
            const b = rgb & 0xff;
            for(let i=0; i<16; i++) {
                const bf = (0.34 * this.cpal[i][0] + 0.5 * this.cpal[i][1] + 0.16 * this.cpal[i][2]) / 0xff;
                this.mpal[i] = [
                    Math.floor(bf * r),
                    Math.floor(bf * g),
                    Math.floor(bf * b)
                ];
            }
        }
        this.refresh();
    };

    get back() {
        return (this.pal[0][0] << 16) | (this.pal[0][1] << 8) | this.pal[0][2];
    };
    set back(rgb) {
        this.mpal[0][0] = (rgb >> 16) & 0xff;
        this.mpal[0][1] = (rgb >> 8) & 0xff;
        this.mpal[0][2] = rgb & 0xff;

        this.cpal[0][0] = (rgb >> 16) & 0xff;
        this.cpal[0][1] = (rgb >> 8) & 0xff;
        this.cpal[0][2] = rgb & 0xff;

        this.refresh();
    };

    draw(addr) {
        const ae = addr & 0xfffe; // even
        const ao = addr | 0x0001; // odd

        // rows are 120 columns wide consuming 128 bytes (0-119)+8
        // every 40 columns rows wrap for a total of three wraps
        // 8 rows wrapping 3 times creates a total of 24 rows
        // bits 6,5 ($60) of columns 0,40,80 yield the wrap row 0,1,2
        // bits 9,8,7 yield the 0-7 relative row number
        //
        // hires graphics repeats the above pattern eight times:
        // $0000, $0400, $0800, $0c00, $1000, $1400, $1800, $1c00
        // bits 12-10 ($1c00) of the address are the repeat number 0-7
        const col = (ae & 0x7f) % 40;  // column: 0-39
        const ac0 = ae - col;  // col 0, 40, 80 address in bits 6,5
        const row = ((ac0 << 1) & 0xc0) | ((ac0 >> 4) & 0x38) | ((ac0 >> 10) & 0x07);
        if(row > 191) return;

        // data is spread across four bytes in main & aux memory
        const id = (addr < 0x4000) ? this._id1 : this._id2;
        this.draw_cell(id, row, col, this._mem._aux[ae], this._mem._main[ae],
                                     this._mem._aux[ao], this._mem._main[ao]);
    }

    draw_cell(id, row, col, b0, b1, b2, b3) {
        const pal = (this._monochrome > 0) ? this.mpal : this.cpal;

        //         main     aux
        // 2000: xddccccb xbbbaaaa
        // 2001: xggggfff xfeeeedd
        //         <--- read ---
        const pca = [
            //         bbbaaaa.             ...xbbba
            // a           ^^^                     ^
            pal[((b0 << 1) & 0x0e) | ((b0 >> 3) & 0x01)],
            //         ...xbbba            xddccccb
            // b           ^^^                    ^
            pal[((b0 >> 3) & 0x0e) | (b1 & 0x01)],
            //        xddccccb       ....xddc
            // c          ^^^               ^
            pal[(b1 & 0x0e) | ((b1 >> 4) & 0x01)],
            //         eeedd...             ....xddc             .xfeeeed
            // d           ^                     ^^                     ^
            pal[((b2 << 3) & 0x08) | ((b1 >> 4) & 0x06) | ((b2 >> 1) & 0x01)],
            //         .xfeeeed             .....xfe
            // e           ^^^                     ^
            pal[((b2 >> 1) & 0x0e) | ((b2 >> 5) & 0x01)],
            //         gggfff..             .....xfe             ..xggggf
            // f           ^^                     ^                     ^
            pal[((b3 << 2) & 0x0c) | ((b2 >> 5) & 0x02) | ((b3 >> 2) & 0x01)],
            //         ..xggggf             ......xg
            // g           ^^^                     ^
            pal[((b3 >> 2) & 0x0e) | ((b3 >> 6) & 0x01)]
        ];

        // row: 0-191, col: 0-39
        const ox = (col * 14) + 1;
        const oy = (row * 2) + 3;
        const lo = (ox + oy * 564) * 4;
        const data = id.data;

        let po = 0;
        for(let x=lo, xmax=lo+112; x<xmax; x+=16) {
            const rgb = pca[po++];
            data[x]   = data[x+4] = data[x+8]  = data[x+12] = data[x+2256] = data[x+2260] = data[x+2264] = data[x+2268] = rgb[0];
            data[x+1] = data[x+5] = data[x+9]  = data[x+13] = data[x+2257] = data[x+2261] = data[x+2265] = data[x+2269] = rgb[1];
            data[x+2] = data[x+6] = data[x+10] = data[x+14] = data[x+2258] = data[x+2262] = data[x+2266] = data[x+2270] = rgb[2];
        }

        if(id == this._id) this._context.putImageData(this._id, 0, 0, ox, oy, 28, 2);
    }

    refresh() {
        if(this._id == this._id1) {
            this._id = undefined; // suspend rendering
            for(let a=0x2000; a<0x4000; a+=2) this.draw(a);
            this._id = this._id1;
            this._context.putImageData(this._id, 0, 0);
        }
        else if(this._id == this._id2) {
            this._id = undefined; // suspend rendering
            for(let a=0x4000; a<0x6000; a+=2) this.draw(a);
            this._id = this._id2;
            this._context.putImageData(this._id, 0, 0);
        }
    }

    set_active_page(page) {
        if(page != 2) {
            // select page 1
            if(!this._page1_init) {
                this._id = undefined; // suspend rendering
                for(let a=0x2000; a<0x4000; a+=2) this.draw(a);
                this._page1_init = true;
            }
            this._id = this._id1;
        } else {
            // select page 2
            if(!this._page2_init) {
                this._id = undefined; // suspend rendering
                for(let a=0x4000; a<0x6000; a+=2) this.draw(a);
                this._page2_init = true;
            }
            this._id = this._id2;
        }
        this._context.putImageData(this._id, 0, 0);
    }

    reset() {
        const imax = 564 * 390 * 4; // (560+4, 384+6) * rgba
        for(let i=0; i<imax; i+=4) {
            this._id1.data[i]   = this._id2.data[i]   = 0x00;
            this._id1.data[i+1] = this._id2.data[i+1] = 0x00;
            this._id1.data[i+2] = this._id2.data[i+2] = 0x00;
            this._id1.data[i+3] = this._id2.data[i+3] = 0xff;
        }
        this._context.putImageData(this._id1, 0, 0);
        this._id = undefined;
        this._page1_init = false;
        this._page2_init = false;
    }
}

