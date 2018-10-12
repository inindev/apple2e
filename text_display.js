//
//  apple2e text display emulation
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//

class TextDisplay
{
    constructor(font_rom, canvas, fore, back, hlines) {
        this._font_rom = font_rom;

        canvas.width = 564;  // 7*2*40 + 4
        canvas.height = 390; // 8*2*24 + 6
        this._context = canvas.getContext('2d', {alpha: false});

        this.fore = fore || 0x00ff66; // green
        this.back = back || 0x111111; // almost black
        this.hlines = hlines == undefined;

        this.reset();
    }

    get fore() {
        return (this._fr << 16) | (this._fg << 8) | this._fb;
    };
    set fore(rgb) {
        this._fr = (rgb >> 16) & 0xff;
        this._fg = (rgb >> 8) & 0xff;
        this._fb = rgb & 0xff;
        this._frl = this._hlines ? this._fr>>1 : this._fr;
        this._fgl = this._hlines ? this._fg>>1 : this._fg;
        this._fbl = this._hlines ? this._fb>>1 : this._fb;
    };

    get back() {
        return (this._br << 16) | (this._bg << 8) | this._bb;
    };
    set back(rgb) {
        this._br = (rgb >> 16) & 0xff;
        this._bg = (rgb >> 8) & 0xff;
        this._bb = rgb & 0xff;
    };

    get hlines() {
        return this._hlines;
    };
    set hlines(val) {
        this._hlines = (val != 0);
        this._frl = this._hlines ? this._fr>>1 : this._fr;
        this._fgl = this._hlines ? this._fg>>1 : this._fg;
        this._fbl = this._hlines ? this._fb>>1 : this._fb;
    };


    draw_text(mem, addr, val) {
        // rows are 120 columns wide consuming 128 bytes (0-119)+8
        // every 40 columns rows wrap for a total of three wraps
        // 8 rows wrapping 3 times creates a total of 24 rows
        // bits 6,5 ($60) of columns 0,40,80 yield the wrap row 0,1,2
        // bits 9,8,7 yield the 0-7 relative row number
        const col = (addr & 0x7f) % 40;  // column: 0-39
        const row = (((addr - col) >> 2) & 0x18) | ((addr >> 7) & 0x07);
        this.draw_char40(row, col, val);
    }


    // draw 14x16 char
    draw_char40(row, col, char) {
        if((row > 23) || (col > 39)) return;

        const ox = (col * 14)+2;
        const oy = (row * 16)+4;

        const id = this._context.getImageData(ox, oy, 14, 16);
        const data = id.data;

        // 7x8 font
        let csl = char * 8;
        for(let y=0; y<64; y+=8) {
            let cp = this._font_rom[csl++];
            for(let x=0; x<56; x+=8) {
                const pos = x + y * 14;
                if(cp & 0x01) {
                    data[pos]   = data[pos+4] = data[pos+56] = data[pos+60] = this._br;
                    data[pos+1] = data[pos+5] = data[pos+57] = data[pos+61] = this._bg;
                    data[pos+2] = data[pos+6] = data[pos+58] = data[pos+62] = this._bb;
                } else {
                    data[pos]    = data[pos+4]  = this._fr;
                    data[pos+1]  = data[pos+5]  = this._fg;
                    data[pos+2]  = data[pos+6]  = this._fb;
                    data[pos+56] = data[pos+60] = this._frl;
                    data[pos+57] = data[pos+61] = this._fgl;
                    data[pos+58] = data[pos+62] = this._fbl;
                }
                cp >>= 1;
            }
        }

        this._context.putImageData(id, ox, oy, 0, 0, 14, 16);
    }


    reset() {
        const id = this._context.createImageData(564, 390);
        const imax = 564 * 390 * 4; // (560+4, 384+6) * rgba
        for(let i=0; i<imax; i+=4) {
            id.data[i]   = this._br;
            id.data[i+1] = this._bg;
            id.data[i+2] = this._bb;
            id.data[i+3] = 0xff;
        }
        this._context.putImageData(id, 0, 0);
    }
}
