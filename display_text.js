//
//  apple2e text display emulation
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//

import {rom_342_0265_a} from "./rom/342-0265-a.js";


export class TextDisplay
{
    constructor(memory, canvas) {
        this._font_rom = rom_342_0265_a;
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

        this._hscan = true;

        this._fore = 0x00ff66; // green
        this._back = 0x111111; // almost black

        this.reset();
    }

    get fore() {
        return (this._fr << 16) | (this._fg << 8) | this._fb;
    };
    set fore(rgb) {
        this._fr = (rgb >> 16) & 0xff;
        this._fg = (rgb >> 8) & 0xff;
        this._fb = rgb & 0xff;
        this._frl = this._hscan ? this._fr>>1 : this._fr;
        this._fgl = this._hscan ? this._fg>>1 : this._fg;
        this._fbl = this._hscan ? this._fb>>1 : this._fb;
        this.refresh();
    };

    get back() {
        return (this._br << 16) | (this._bg << 8) | this._bb;
    };
    set back(rgb) {
        this._br = (rgb >> 16) & 0xff;
        this._bg = (rgb >> 8) & 0xff;
        this._bb = rgb & 0xff;
        this.refresh();
    };

    get hscan() {
        return this._hscan;
    };
    set hscan(val) {
        this._hscan = (val != 0);
        this._frl = this._hscan ? this._fr>>1 : this._fr;
        this._fgl = this._hscan ? this._fg>>1 : this._fg;
        this._fbl = this._hscan ? this._fb>>1 : this._fb;
        this.refresh();
    };

    draw_text(addr, val) {
        // rows are 120 columns wide consuming 128 bytes (0-119)+8
        // every 40 columns rows wrap for a total of three wraps
        // 8 rows wrapping 3 times creates a total of 24 rows
        // bits 6,5 ($60) of columns 0,40,80 yield the wrap row 0,1,2
        // bits 9,8,7 yield the 0-7 relative row number
        const col = (addr & 0x7f) % 40;  // column: 0-39
        const row = (((addr - col) >> 2) & 0x18) | ((addr >> 7) & 0x07);
        const id = (addr < 0x0800) ? this._id1 : this._id2;
        this.draw_char40(id, row, col, val);
    }

    // draw 14x16 char
    draw_char40(id, row, col, char) {
        if((row > 23) || (col > 39)) return;

        const ox = (col * 14) + 2;
        const oy = (row * 16) + 4;
        const lo = (ox + oy * 564) * 4;
        const data = id.data;

        // 7x8 font
        let csl = char * 8;
        // 64 * 564 = 36096,  8 * 564 = 4512
        for(let y=0; y<36096; y+=4512) {
            let cp = this._font_rom[csl++];
            // 7 * 8 = 56
            for(let x=lo, xmax=lo+56; x<xmax; x+=8) {
                const p = x + y;
                if(cp & 0x01) {
                    data[p]   = data[p+4] = data[p+2256] = data[p+2260] = this._br;
                    data[p+1] = data[p+5] = data[p+2257] = data[p+2261] = this._bg;
                    data[p+2] = data[p+6] = data[p+2258] = data[p+2262] = this._bb;
                } else {
                    data[p]    = data[p+4]  = this._fr;
                    data[p+1]  = data[p+5]  = this._fg;
                    data[p+2]  = data[p+6]  = this._fb;
                    data[p+2256] = data[p+2260] = this._frl;
                    data[p+2257] = data[p+2261] = this._fgl;
                    data[p+2258] = data[p+2262] = this._fbl;
                }
                cp >>= 1;
            }
        }

        if(id == this._id) this._context.putImageData(this._id, 0, 0, ox, oy, 14, 16);
    }

    refresh() {
        if(this._id == this._id1) {
            this._id = undefined; // suspend rendering
            for(let a=0x0400; a<0x0800; a++) this.draw_text(a, this._mem.read(a));
            this._id = this._id1;
            this._context.putImageData(this._id, 0, 0);
        }
        else if(this._id == this._id2) {
            this._id = undefined; // suspend rendering
            for(let a=0x0800; a<0x0c00; a++) this.draw_text(a, this._mem.read(a));
            this._id = this._id2;
            this._context.putImageData(this._id, 0, 0);
        }
    }

    set_active_page(page) {
        if(page != 2) {
            // select page 1
            if(!this._page1_init) {
                this._id = undefined; // suspend rendering
                for(let a=0x0400; a<0x0800; a++) this.draw_text(a, this._mem.read(a));
                this._page1_init = true;
            }
            this._id = this._id1;
        } else {
            // select page 2
            if(!this._page2_init) {
                this._id = undefined; // suspend rendering
                for(let a=0x0800; a<0x0c00; a++) this.draw_text(a, this._mem.read(a));
                this._page2_init = true;
            }
            this._id = this._id2;
        }
        this._context.putImageData(this._id, 0, 0);
    }

    reset() {
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

