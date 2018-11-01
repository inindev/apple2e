//
//  apple2e io mamager
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%201.pdf
//       ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%202.pdf
//       ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%203.pdf
//       ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%204.pdf
//


export class IOManager
{
    constructor(memory, keyboard, display_text, display_hires) {
        this._mem = memory;
        this._kbd = keyboard;
        this._display_text = display_text;
        this._display_hires = display_hires;

        this._c3_rom = false;
        this._c8_rom = false;
        this._cx_rom = false;

        this._text_mode = true;
        this._mixed_mode = false;
        this._altchar_mode = false;
        this._80col_mode = false;
        this._double_hires = false;

        this._bsr_write_count = 0;

        this._mem.add_read_hook(this.read.bind(this));
        this._mem.add_write_hook(this.write.bind(this));
    }


    ////////////////////////////////////////////
    read(addr) {
        if((addr & 0xf000) != 0xc000) return undefined; // default read

        // c000-c0ff: read switches
        if((addr & 0xff00) == 0xc000) {
            //console.log("c0xx read switch: " + addr.toString(16));
            switch(addr)
            {
                case 0xc000: // keyboard io
                    return this._kbd.key;
                case 0xc010: // keyboard strobe
                    this._kbd.strobe();
                    return 0;
                case 0xc011: // bank (0: bank1, 0x80: bank2)
                    //console.log("active bank: " + this._mem.bsr_bank2 ? "2" : "1");
                    return this._mem.bsr_bank2 ? 0x80 : 0;
                case 0xc012: // ram/rom (0: rom, 0x80: ram)
                    //console.log("bank switch ram read: " + this._mem.bsr_read);
                    return this._mem.bsr_read ? 0x80 : 0;
                case 0xc013: // read main/aux (0: main, 0x80: aux)
                    //console.log("aux ram read: " + this._mem.aux_read);
                    return this._mem.aux_read ? 0x80 : 0;
                case 0xc014: // write main/aux (0: main, 0x80: aux)
                    //console.log("aux ram write: " + this._mem.aux_write);
                    return this._mem.aux_write ? 0x80 : 0;
                case 0xc015: // cx-rom (0: slots active, 0x80: use internal rom)
                    return this._cx_rom ? 0x80 : 0;
                case 0xc016: // zp (0: main zp/stack, 0x80: aux zp/stack)
                    //console.log("aux zp/stack: " + this._mem.aux_zp);
                    return this._mem.aux_zp ? 0x80 : 0;
                case 0xc017: // c3-rom (0: use internal rom, 0x80: slot 3 io active)
                    //console.log("c3 rom: " + this._c3_rom);
                    return this._c3_rom ? 0 : 0x80;
                case 0xc018: // 80store (0: 80store off, 0x80: 80store on)
                    //console.log("80 store: " + this._mem.dms_80store);
                    return this._mem.dms_80store ? 0x80 : 0;
                case 0xc01a: // text (0: graphics mode, 0x80: text mode)
                    return this._text_mode ? 0x80 : 0;
                case 0xc01b: // mixed mode (0: full screen, 0x80: mixed mode)
                    return this._mixed_mode ? 0x80 : 0;
                case 0xc01c: // page2 (0: main, 0x80: aux)
                    return this._mem.dms_page2 ? 0x80 : 0;
                case 0xc01d: // hires (0: lores, 0x80: hires)
                    return this._mem.dms_hires ? 0x80 : 0;
                case 0xc01e: // alt char mode (0: alt char mode off, 0x80: alt char mode on)
                    return this._altchar_mode ? 0x80 : 0;
                case 0xc01f: // 80 col mode (0: 40 cols, 0x80: 80 cols)
                    return this._80col_mode ? 0x80 : 0;
                case 0xc07f: // double hires (0: double hires inactive, 0x80: double hires active)
                    //console.log("double hires: " + this._double_hires);
                    return this._double_hires ? 0 : 0x80;
                default:
                    break;
            }

            // slots begin at 0xc090
            if(addr > 0xc08f) return undefined;

            return this.rw_switches(addr);
        }

        // c100-cfff: rom handling
        //   c3: c300-c3ff
        //   c8: c800-cfff
        //   cx: c100-cfff

        // c100-cfff: cx rom
        if(this._cx_rom) {
            // c300-c3ff
            if((addr & 0xff00) == 0xc300) {
                this._c8_rom = true;
            }
            else if(addr == 0xcfff) {
                this._c8_rom = false;
            }
            return undefined; // default cx rom read
        }
        // c300-c3ff: c3 rom
        if(this._c3_rom && ((addr & 0xff00) == 0xc300)) {
            this._c8_rom = true;
            return undefined; // default c3 rom read
        }
        // c800-cfff: c8 rom
        if(this._c8_rom && (addr >= 0xc800)) {
            if(addr == 0xcfff) {
                this._c8_rom = false;
            }
            return undefined; // default c8 rom read
        }
    }


    ////////////////////////////////////////////
    write(addr, val) {
        if(this._mem.dms_hires) {
            if(this._mem.dms_page2) {
                // 4000-5fff: hires graphics page 2
                if((addr & 0xe000) == 0x4000) {
                    this._display_hires.draw(this._mem, addr, val);
                    return undefined; // commit to ram
                }
            } else {
                // 2000-3fff: hires graphics page 1
                if((addr & 0xe000) == 0x2000) {
                    this._display_hires.draw(this._mem, addr, val);
                    return undefined; // commit to ram
                }
            }
        }

        else if(this._text_mode) {
            if(this._mem.dms_page2) {
                // 0800-0bff: text page 2
                if((addr & 0xfc00) == 0x0800) {
                    this._display_text.draw_text(this._mem, addr, val);
                    return undefined; // commit to ram
                }
            } else {
                // 0400-07ff: text page 1
                if((addr & 0xfc00) == 0x0400) {
                    this._display_text.draw_text(this._mem, addr, val);
                    return undefined; // commit to ram
                }
            }
        }


        // c000-c0ff: write switches
        if((addr & 0xff00) == 0xc000) {
            //console.log("c0xx write switch: [" + addr.toString(16) + "] --> val: " + val);

            // keyboard strobe (write: 0xc010-0xc01f)
            if((addr & 0xfff0) == 0xc010) {
                this._kbd.strobe();
                return 0; // write handled
            }

            switch(addr)
            {
                case 0xc000: // 80store off
                    //console.log("80store off");
                    this._mem.dms_80store = false;
                    return 0; // write handled
                case 0xc001: // 80store on
                    //console.log("80store on");
                    this._mem.dms_80store = true;
                    return 0; // write handled
                case 0xc002: // read main memory
                    //console.log("aux ram read off");
                    this._mem.aux_read = false;
                    return 0; // write handled
                case 0xc003: // read aux memory
                    //console.log("aux ram read on");
                    this._mem.aux_read = true;
                    return 0; // write handled
                case 0xc004: // write main memory
                    //console.log("aux ram write off");
                    this._mem.aux_write = false;
                    return 0; // write handled
                case 0xc005: // write aux memory
                    //console.log("aux ram write on");
                    this._mem.aux_write = true;
                    return 0; // write handled
                case 0xc006: // cx rom off
                    //console.log("cx rom off");
                    this._cx_rom = false;
                    return 0; // write handled
                case 0xc007: // cx rom on
                    //console.log("cx rom on");
                    this._cx_rom = true;
                    return 0; // write handled
                case 0xc008: // use main zp & stack
                    //console.log("aux ram zp/stack off");
                    this._mem.aux_zp = false;
                    return 0; // write handled
                case 0xc009: // use aux zp & stack
                    //console.log("aux ram zp/stack on");
                    this._mem.aux_zp = true;
                    return 0; // write handled
                case 0xc00a: // c3 rom on (slot 3 io off)
                    //console.log("c3 rom on (slot 3 io off)");
                    this._c3_rom = true;
                    return 0; // write handled
                case 0xc00b: // c3 rom off (slot 3 io on)
                    //console.log("c3 rom off (slot 3 io on)");
                    this._c3_rom = false;
                    return 0; // write handled
                case 0xc00c: // 80 col off
                    //console.log("80 col off");
                    this._80col_mode = false;
                    return 0; // write handled
                case 0xc00d: // 80 col on
                    //console.log("80 col on");
                    this._80col_mode = true;
                    return 0; // write handled
                case 0xc00e: // alt char off
                    //console.log("alt char off");
                    this._altchar_mode = false;
                    return 0; // write handled
                case 0xc00f: // alt char on
                    //console.log("alt char on");
                    this._altchar_mode = true;
                    return 0; // write handled
                //case 0xc010: // keyboard strobe
                //    this._kbd.strobe();
                //    return 0; // write handled
                default:
                    break;
            }

            // slots begin at 0xc090
            if(addr > 0xc08f) return undefined;

            return this.rw_switches(addr);
        }
    }


    rw_switches(addr) {
        switch(addr)
        {
            case 0xc030: // speaker toggle
                //console.log("speaker toggle");
                return undefined;
//                break;
            case 0xc050: // text mode off
                //console.log("text mode off");
                this._text_mode = false;
                break;
            case 0xc051: // text mode on
                //console.log("text mode on");
                this._text_mode = true;
                break;
            case 0xc052: // full screen
                //console.log("mixed mode off");
                this._mixed_mode = false;
                break;
            case 0xc053: // mixed mode
                //console.log("mixed mode on");
                this._mixed_mode = true;
                break;
            case 0xc054: // page2 off
                //console.log("page2 off");
                if(this._mem.dms_page2) {
                    this._mem.dms_page2 = false;
//                    if(!this._mem.dms_80store) for(let a=0x400; a<0x800; a++) this._display_text.draw_text(this._mem, a, this._mem.read(a));
                }
                break;
            case 0xc055: // page2 on
                //console.log("page2 on");
                if(!this._mem.dms_page2) {
                    this._mem.dms_page2 = true;
//                    if(!this._mem.dms_80store) for(let a=0x800; a<0xc00; a++) this._display_text.draw_text(this._mem, a, this._mem.read(a));
                }
                break;
            case 0xc056: // hires off
                //console.log("hires off");
                if(this._mem.dms_hires) {
                    this._mem.dms_hires = false;
//                    if(!this._mem.dms_80store) for(let a=0x2000; a<0x4000; a++) this._display_hires.draw(this._mem, a, this._mem.read(a));
                }
                break;
            case 0xc057: // hires on
                //console.log("hires on");
                if(!this._mem.dms_hires) {
                    this._mem.dms_hires = true;
//                    if(!this._mem.dms_80store) for(let a=0x4000; a<0x6000; a++) this._display_hires.draw(this._mem, a, this._mem.read(a));
                }
                break;
            case 0xc05e: // double hires on
                if(this._80col_mode) {
                    console.log("double hires on");
                    this._double_hires = true;
                }
                break;
            case 0xc05f: // double hires off
                if(this._80col_mode) {
                    console.log("double hires off");
                    this._double_hires = false;
                }
                break;
            default: // bsr: c080-c08f
                // bank select switches
                // apple tech ref p.82
                if((addr >= 0xc080) && (addr <= 0xc08f)) {
                    // bit 0: ram read/write, (0: read only, 1: write)
                    if((addr & 0x01) != 0) {
                        this._bsr_write_count++;
                    } else {
                        this._bsr_write_count = 0;
                    }
                    this._mem.bsr_write = (this._bsr_write_count > 1); // requires two reads to activate write mode

                    // bit 3: d000 bank select, (0: bank 2, 8: bank 1)
                    this._mem.bsr_bank2 = (addr & 0x08) == 0;

                    // 0000 ram 0^0 = 0
                    // 0001 rom 1^0 = 1
                    // 0010 rom 0^1 = 1
                    // 0011 ram 1^1 = 0
                    this._mem.bsr_read = ((addr ^ (addr>>1)) & 0x01) == 0;
                    //console.log("bank select [" + addr.toString(16) + "], dx read: " + this._mem.bsr_read + "  dx write: " + this._mem.bsr_write + "  dx bank2: " + this._mem.bsr_bank2);
                }
                break;
        }

        return 0; // switch processed
    }


    reset() {
        this._c3_rom = false;
        this._c8_rom = false;
        this._cx_rom = false;

        this._text_mode = true;
        this._bsr_write_count = 0;
    }
}

