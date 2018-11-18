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


//
//  table 2-10: display soft switches (p.29)
//
//    name        action  hex     function
//    --------------------------------------------------------------------------------------
//    AltChar     W       $C00E   off: display text using primary character set
//    AltChar     W       $C00F   on:  display text using alternate character set
//    RdAltChar   R7      $C01E   read AltChar switch (1 = on)
//    --------------------------------------------------------------------------------------
//    80Col       W       $C00C   off: display 40 columns
//    80Col       W       $C00D   on:  display 80 columns
//    Rd80Col     R7      $C01F   read 80Col switch (1 = on)
//    --------------------------------------------------------------------------------------
//    80Store     W       $C000   off: cause Page2 on to select auxiliary RAM
//    80Store     W       $0001   on:  allow Page2 to switch main RAM areas
//    Rd80Store   R7      $0018   read 80Store switch (1 = on)
//    --------------------------------------------------------------------------------------
//    Page2       R/W     $C054   off: select page 1
//    Page2       R/W     $0055   on:  select Page2 or, if 80Store on, page 1 in auxiliary memory
//    RdPage2     R7      $C01C   read Page2 switch (1 = on)
//    --------------------------------------------------------------------------------------
//    TEXT        R/W     $0050   off: display graphics or (if MIXED on) mixed
//    TEXT        R/W     $0051   on:  display text
//    RdTEXT      R7      $C01A   read TEXT switch (1 = on)
//    --------------------------------------------------------------------------------------
//    MIXED       R/W     $0052   off: display only text or only graphics
//    MIXED       R/W     $0053   on:  (if TEXT off) display text and graphics
//    RdMIXED     R7      $C01B   read MIXED switch (1 = on)
//    --------------------------------------------------------------------------------------
//    HiRes       R/W     $0056   off: (if TEXT off) display low-resolution graphics
//    HiRes       R/W     $0057   on:  (if TEXT off) display high-resolution or (if DHiRes on) double-high-resolution graphics
//    RdHiRes     R7      $C01D   read HiRes switch (1 = on)
//    --------------------------------------------------------------------------------------
//    IOUDis      W       $C07E   on:  disable IOU access for addresses $0058 to $C05F; enable access to DHiRes switch *
//    IOUDis      W       $C07F   off: enable IOU access for addresses $0058 to $C05F; disable access to DHiRes switch *
//    RdlOUDis    R7      $C07E   read IOUDis switch (1 = off) **
//    --------------------------------------------------------------------------------------
//    DHiRes      R/W     $C05E   on:  (if IOUDis on) turn on double-high-resolution
//    DHiRes      R/W     $C05F   off: (if IOUDis on) turn off double-high-resolution
//    RdDHiRes    R7      $C07F   read DHiRes switch (1 = on) **
//    --------------------------------------------------------------------------------------
//
//    *  the firmware normally leaves IOUDis on (see also ** below)
//    ** reading or writing any address in the range $C070-$C07F also
//       triggers the paddle timer and resets VBLInt (see chapter 7)
//


export class IOManager
{
    constructor(memory, keyboard, display_text, display_hires, display_double_hires, audio_cb, joystick) {
        this._mem = memory;
        this._kbd = keyboard;
        this._display_text = display_text;
        this._display_hires = display_hires;
        this._display_double_hires = display_double_hires;
        this._audio_cb = audio_cb;
        this._joystick = joystick;

        this._c3_rom = false;
        this._c8_rom = false;
        this._cx_rom = false;

        this._text_mode = true;
        this._mixed_mode = false;
        this._altchar_mode = false;
        this._80col_mode = false;
        this._double_hires = false;
        this._iou_disable = true;

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
                case 0xc061: // js pb0
                    return this._joystick.button0 ? 0x80 : 0;
                case 0xc062: // js pb1
                    return this._joystick.button1 ? 0x80 : 0;
                case 0xc063: // js pb2
                    return this._joystick.button2 ? 0x80 : 0;
                case 0xc064: // js pdl-0
                    return this._joystick.axis0;
                case 0xc065: // js pdl-1
                    return this._joystick.axis1;
                case 0xc066: // js pdl-2
                    return this._joystick.axis2;
                case 0xc067: // js pdl-3
                    return this._joystick.axis3;
                case 0xc070: // trigger paddle read
                    return 0;
                case 0xc07e: // iou disable (0: iou is enabled, 0x80: iou is disabled)
                    //console.log("iou disable: " + this._iou_disable);
                    return this._iou_disable ? 0x80 : 0;
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
        this.draw_display(addr, val);

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
                    if(this._80col_mode) {
                        this._80col_mode = false;
                        this.switch_display_mode();
                    }
                    return 0; // write handled
                case 0xc00d: // 80 col on
                    //console.log("80 col on");
                    if(!this._80col_mode) {
                        this._80col_mode = true;
                        this.switch_display_mode();
                    }
                    return 0; // write handled
                case 0xc00e: // alt char off
                    //console.log("alt char off");
                    this._altchar_mode = false;
                    return 0; // write handled
                case 0xc00f: // alt char on
                    //console.log("alt char on");
                    this._altchar_mode = true;
                    return 0; // write handled
                //case 0xc010: // keyboard strobe (handled above)
                //    this._kbd.strobe();
                //    return 0; // write handled
                case 0xc07e: // iou disable on
                    this._iou_disable = true;
                    return 0; // write handled
                case 0xc07f: // iou disable off
                    this._iou_disable = false;
                    return 0; // write handled
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
                this._audio_cb();
                break;
            case 0xc050: // text mode off
                //console.log("text mode off");
                if(this._text_mode) {
                    this._text_mode = false;
                    this.switch_display_mode();
                }
                break;
            case 0xc051: // text mode on
                //console.log("text mode on");
                if(!this._text_mode) {
                    this._text_mode = true;
                    this.switch_display_mode();
                }
                break;
            case 0xc052: // mixed mode off
                //console.log("mixed mode off");
                if(this._mixed_mode) {
                    this._mixed_mode = false;
                    this.switch_display_mode();
                }
                break;
            case 0xc053: // mixed mode on
                //console.log("mixed mode on");
                if(!this._mixed_mode) {
                    this._mixed_mode = true;
                    this.switch_display_mode();
                }
                break;
            case 0xc054: // page2 off
                //console.log("page2 off");
                if(this._mem.dms_page2) {
                    this._mem.dms_page2 = false;
                    if(!this._mem.dms_80store) this.switch_display_mode();
                }
                break;
            case 0xc055: // page2 on
                //console.log("page2 on");
                if(!this._mem.dms_page2) {
                    this._mem.dms_page2 = true;
                    if(!this._mem.dms_80store) this.switch_display_mode();
                }
                break;
            case 0xc056: // hires off
                //console.log("hires off");
                if(this._mem.dms_hires) {
                    this._mem.dms_hires = false;
                    this.switch_display_mode();
                }
                break;
            case 0xc057: // hires on
                //console.log("hires on");
                if(!this._mem.dms_hires) {
                    this._mem.dms_hires = true;
// TODO: emperical testing suggests we clear the ram before enabling
//for(let a=0x2000; a<0x4000; a++) this._mem._main[a] = 0;
                    this.switch_display_mode();
                }
                break;
            case 0xc05e: // double hires on
                if(this._iou_disable) {
                    //console.log("double hires on");
                    if(!this._mem._double_hires) {
                        this._double_hires = true;
                        this.switch_display_mode();
                    }
                }
                break;
            case 0xc05f: // double hires off
                if(this._iou_disable) {
                    //console.log("double hires off");
                    if(this._mem._double_hires) {
                        this._double_hires = false;
                        this.switch_display_mode();
                    }
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


    draw_display(addr, val) {
        if(this._text_mode) {
            // 0400-07ff: text page 1
            // 0800-0bff: text page 2
            if( ((addr & 0xfc00) == 0x0400) ||
                (((addr & 0xfc00) == 0x0800) && this._mem.dms_page2 && !this._mem.dms_80store) ) {
                this._display_text.draw_text(addr, val);
            }
        } else {
            // 2000-3fff: graphics page 1
            // 4000-5fff: graphics page 2
            if( ((addr & 0xe000) == 0x2000) ||
                (((addr & 0xe000) == 0x4000) && this._mem.dms_page2 && !this._mem.dms_80store) ) {
                if(this._mem.dms_hires) {
                    // hires graphics modes
                    if(this._double_hires) {
                        this._display_double_hires.draw(addr);
                    } else {
                        this._display_hires.draw(addr, val);
                    }
                } else {
                    // TODO: lores graphics modes
                }
            }
        }
    }


    switch_display_mode() {
        this._display_text.reset();
        this._display_hires.reset();
        this._display_double_hires.reset();

        const is_page2 = this._mem.dms_page2 && !this._mem.dms_80store;

        if(this._text_mode) {
            // text mode
            //console.log("enabling text mode: " + (is_page2 ? "page2" : "page1"));
            this._display_text.set_active_page(is_page2 ? 2 : 1);
        } else {
            // graphics modes
            // TODO: mixed modes
            if(this._mem.dms_hires) {
                if(this._double_hires) {
                    //console.log("enabling double-hires graphics mode: " + (is_page2 ? "page2" : "page1"));
                    this._display_double_hires.set_active_page(is_page2 ? 2 : 1);
                } else {
                    //console.log("enabling hires graphics mode: " + (is_page2 ? "page2" : "page1"));
                    this._display_hires.set_active_page(is_page2 ? 2 : 1);
                }
            } else {
                // TODO: lores graphics
                if(this._double_hires) {
                    //console.log("enabling " + (this._mixed_mode ? "mixed " : "") + "double-lores graphics mode, " + (is_page2 ? "page2" : "page1"));
                } else {
                    //console.log("enabling " + (this._mixed_mode ? "mixed " : "") + "lores graphics mode, " + (is_page2 ? "page2" : "page1"));
                }
            }
        }
    }


    reset() {
        this._c3_rom = false;
        this._c8_rom = false;
        this._cx_rom = false;

        this._text_mode = true;
        this._mixed_mode = false;
        this._altchar_mode = false;
        this._80col_mode = false;
        this._double_hires = false;
        this._iou_disable = true;

        this._bsr_write_count = 0;
    }
}

