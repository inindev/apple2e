//
//  apple2e keyboard emulation
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: https://en.wikipedia.org/wiki/Apple_II_character_set
//


export class Keyboard
{
    constructor() {
        this._key = 0x7f;
        this._key_pressed = false;

        this.key_map = {
            0x25: 0x08, // (left arrow)
            0x26: 0x0b, // (up arrow)
            0x27: 0x15, // (right arrow)
            0x28: 0x0a, // (down arrow)
            0xbc: 0x2c, // , (comma)
            0xbe: 0x2e, // . (period)
            0xbf: 0x2f, // / (slash)
            0xc0: 0x60, // ` (grave)
            0xde: 0x27, // ' (single quote)
        };

        this.key_map_ctrl = {
            0x43: 0x03, // c (break)
            0x47: 0x07, // g (bell)
            0x4a: 0x0a, // j (new line)
            0x4d: 0x0d, // m (carriage return)
        };

        this.key_map_shift = {
            0x30: 0x29, // ) (right paren)
            0x31: 0x21, // ! (exclamation)
            0x32: 0x40, // @ (at)
            0x33: 0x23, // # (pound)
            0x34: 0x24, // $ (currency)
            0x35: 0x25, // % (percent)
            0x36: 0x5e, // ^ (caret)
            0x37: 0x26, // & (ampersand)
            0x38: 0x2a, // * (star)
            0x39: 0x28, // ( (left paren)
            0x3b: 0x3a, // : (colon)
            0x3d: 0x2b, // + (plus)
            0xad: 0x5f, // _ (underbar)
            0xbc: 0x3c, // < (less than)
            0xbe: 0x3e, // > (greater than)
            0xc0: 0x7e, // ~ (tilde)
            0xbf: 0x3f, // ? (question mark)
            0xdb: 0x7b, // { (left curly bracket)
            0xdc: 0x7c, // | (pipe)
            0xdd: 0x7d, // } (right curly bracket)
            0xde: 0x22, // " (double quote)
        };
    }

    get key() { return this._key; };
    set key(val) { this._key = val; }
    get key_pressed() { return this._key_pressed; };
    set key_pressed(val) { this._key_pressed = (val != 0); }

    strobe() {
        this._key = 0x7f;
    }

    key_down(code, shift, ctrl, meta) {
        this._key_pressed = true;

        // control
        if(ctrl) {
            if(code in this.key_map_ctrl) {
                code = this.key_map_ctrl[code];
            } else {
                return; // unknown control key
            }
        }

        // shift
        else if(shift) {
            if(code in this.key_map_shift) {
                code = this.key_map_shift[code];
            } else {
                return; // unknown shift key
            }
        }

        // regular keys
        else if(code in this.key_map) {
            code = this.key_map[code];
        }

        this._key = code | 0x80;
    }


    key_up() {
        this._key_pressed = false;
    }
}
