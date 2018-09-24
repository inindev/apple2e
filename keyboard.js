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


class Keyboard
{
    constructor(bytes) {
        this._key = 0xff;
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
            0x30: 0x29, // )
            0x31: 0x21, // !
            0x32: 0x40, // @
            0x33: 0x23, // #
            0x34: 0x24, // $
            0x35: 0x25, // %
            0x36: 0x5e, // ^
            0x37: 0x26, // &
            0x38: 0x2a, // *
            0x39: 0x28, // (
            0x3b: 0x3a, // :
            0x3d: 0x2b, // +
            0xad: 0x5f, // _
            0xbc: 0x3c, // <
            0xbe: 0x3e, // >
            0xc0: 0x7e, // ~
            0xbf: 0x3f, // ?
            0xdb: 0x7b, // {
            0xdc: 0x7c, // |
            0xdd: 0x7d, // }
            0xde: 0x22, // " (double quote)
        };
    }

    get key() { return this._key; };
    set key(val) { this._key = val; }
    get key_pressed() { return this._key_pressed; };
    set key_pressed(val) { this._key_pressed = (val == 0); }

    key_down(event) {
        if(!event.metaKey) {  // TODO: ignore meta?
            event.preventDefault();
        }
        this._key_pressed = true;

        let key = event.keyCode;

        // control
        if(event.ctrlKey) {
            if(key in this.key_map_ctrl) {
                key = this.key_map_ctrl[key];
            } else {
                return; // unknown control key
            }
        }

        // shift
        else if(event.shiftKey) {
            if(key in this.key_map_shift) {
                key = this.key_map_shift[key];
            } else {
                return; // unknown shift key
            }
        }

        // regular keys
        else if(key in this.key_map) {
            key = this.key_map[key];
        }

        this._key = key | 0x80;
    }


    key_up(event) {
        this._key_pressed = false;
    }
}
