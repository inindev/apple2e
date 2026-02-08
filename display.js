//
//  apple2e unified video system - Framebuffer Manager
//
//  Copyright 2018-2026, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  architecture: write-triggered rendering with 8-bit indexed framebuffer
//  - framebuffer: 560x192 pixels, 8-bit palette indices (105KB)
//  - on_memory_write(): updates framebuffer immediately for visible addresses
//  - on_soft_switch(): detects mode changes and triggers full re-render
//  - no canvas knowledge -- that's handled by CanvasRenderer
//

// character rom
import {rom_342_0265_a} from "./rom/342-0265-a.js";


export class Display
{
    constructor(memory) {
        this._mem = memory;

        // character ROM for text modes
        this._font_rom = rom_342_0265_a;

        // framebuffer: 560x192 8-bit indexed color

        // this is the core rendering target - always up-to-date
        this._framebuffer = new Uint8Array(560 * 192);  // 107,520 bytes

        // page initialization tracking (for lazy clearing)
        this._page1_init = false;
        this._page2_init = false;

        // track last mode state for detecting actual visible memory changes
        this._last_mode = null;

        // register for Memory flag change notifications
        // when PAGE2/HIRES/80STORE change, re-render if needed
        this._mem.add_flag_hook(() => this._on_flag_change());

        // video mode flags
        // note: page2, hires, and 80store are kept in Memory class because they affect memory banking
        this.mode = {
            text: true,          // $c050/$c051: text vs graphics
            mixed: false,        // $c052/$c053: mixed mode
            col80: false,        // $c00c/$c00d: 40-column vs 80-column
            dhires: false,       // $c05e/$c05f: double hi-res
            altcharset: true     // $c00e/$c00f: alternate character set
        };

        // palette
        // standard Apple IIgs palette (matches canvas_renderer.js)
        this.BLACK = 0;
        this.MAGENTA = 1;
        this.DARK_BLUE = 2;
        this.PURPLE = 3;
        this.DARK_GREEN = 4;
        this.DARK_GRAY = 5;
        this.BLUE = 6;
        this.LIGHT_BLUE = 7;
        this.BROWN = 8;
        this.ORANGE = 9;
        this.GRAY = 10;
        this.PINK = 11;
        this.GREEN = 12;
        this.YELLOW = 13;
        this.AQUA = 14;
        this.WHITE = 15;

        // text mode uses indices 0 (BLACK), 15 (WHITE)
        // hires mode uses: BLACK(0), PURPLE(3), BLUE(6), ORANGE(9), GREEN(12), WHITE(15)
        // double-hires uses all indices 0-15

        // text line offsets (24 rows)
        this._text_offsets = new Uint16Array(24);
        for(let row = 0; row < 24; row++) {
            this._text_offsets[row] =
                ((row & 7) << 7) +        // Which group
                (((row >> 3) & 3) * 40);  // Which third
        }

        // hires line offsets (192 rows)
        this._hires_offsets = new Uint16Array(192);
        for(let row = 0; row < 192; row++) {
            this._hires_offsets[row] =
                ((row & 7) << 10) +       // Which group (* 1024)
                (((row >> 3) & 7) << 7) + // Which third (* 128)
                ((row >> 6) * 40);        // Which section
        }

        // hires color groups (3-bit pattern lookup)
        // green/purple (bit 7 = 0)
        //                        000         001         010          011         100         101          110         111
        const group1_even = [this.BLACK, this.BLACK, this.GREEN,  this.WHITE, this.BLACK, this.PURPLE, this.WHITE, this.WHITE];
        const group1_odd  = [this.BLACK, this.BLACK, this.PURPLE, this.WHITE, this.BLACK, this.GREEN,  this.WHITE, this.WHITE];
        // orange/blue (bit 7 = 1)
        //                        000         001         010          011         100         101          110         111
        const group2_even = [this.BLACK, this.BLACK, this.ORANGE, this.WHITE, this.BLACK, this.BLUE,   this.WHITE, this.WHITE];
        const group2_odd  = [this.BLACK, this.BLACK, this.BLUE,   this.WHITE, this.BLACK, this.ORANGE, this.WHITE, this.WHITE];

        this._hires_color_groups = [
            [group1_even, group1_odd],  // bit 7 = 0
            [group2_even, group2_odd]   // bit 7 = 1
        ];
    }

    // get framebuffer for rendering
    // returns 560x192 framebuffer
    get_framebuffer() {
        return this._framebuffer;
    }

    // called by called emulator when memory is written
    on_memory_write(address, value, is_aux) {
        // Check if this address is currently visible
        if(!this._is_address_visible(address, is_aux)) {
            return; // Not visible, ignore
        }

        // Update affected pixels immediately (write-triggered)
        this._update_pixels_for_address(address, value, is_aux);
    }

    // soft switch address (0xc000-0xc0ff)
    on_soft_switch(address) {
        const old_mode = this._capture_mode();

        // update mode flags based on soft switch
        switch (address & 0xffff) {
            // text/graphics
            case 0xc050:  // TXTCLR - clear text mode (graphics)
                this.mode.text = false;
                break;
            case 0xc051:  // TXTSET - set text mode
                this.mode.text = true;
                break;

            // mixed mode
            case 0xc052: this.mode.mixed = false; break;
            case 0xc053: this.mode.mixed = true; break;

            // page selection (handled by memory.js via flag hook)
            case 0xc054:  // PAGE2 off
            case 0xc055:  // PAGE2 on
            case 0xc056:  // HIRES off
            case 0xc057:  // HIRES on
                // memory property setters detect changes and call flag hooks
                // flag hook calls _on_flag_change() which triggers re-render
                // nothing to do here
                return;

            // 40/80 column
            case 0xc00c: this.mode.col80 = false; break;
            case 0xc00d: this.mode.col80 = true; break;

            // double hi-res
            case 0xc05e: this.mode.dhires = true; break;
            case 0xc05f: this.mode.dhires = false; break;

            // alternate character set
            case 0xc00e: this.mode.altcharset = false; break;
            case 0xc00f: this.mode.altcharset = true; break;

            // 80STORE (handled by memory.js, fall through for mode check)
            case 0xc000: break;  // 80STORE off
            case 0xc001: break;  // 80STORE on

            default:
                return; // Not a video mode switch
        }

        const new_mode = this._capture_mode();

        // check for visible memory region change
        if(this._visible_memory_changed(old_mode, new_mode)) {
            this._full_render(); // Full re-render required
        }
    }

    reset() {
        this.mode.text = true;
        this.mode.mixed = false;
        // page2, hires are in Memory (reset handles them)
        this.mode.col80 = false;
        this.mode.dhires = false;
        this.mode.altcharset = true;  // default on for lowercase support

        this._page1_init = false;
        this._page2_init = false;

        // clear framebuffer - memory writes will trigger rendering via on_memory_write()
        this._framebuffer.fill(this.BLACK);
    }

    // mode detection
    _capture_mode() {
        // capture complete mode state including flags from memory.js
        return {
            ...this.mode,
            page2: this._mem.dms_page2,
            hires: this._mem.dms_hires,
            store80: this._mem.dms_80store
        };
    }

    // check if the visible memory region changed
    // if so, this requires full re-render
    _visible_memory_changed(old_mode, new_mode) {
        // text/graphics mode changed
        if(old_mode.text !== new_mode.text) return true;

        // page 2 changed (and 80STORE is off)
        if(old_mode.page2 !== new_mode.page2 && !this._mem.dms_80store) return true;

        // hi-res changed
        if(old_mode.hires !== new_mode.hires) return true;

        // 80-column changed
        if(old_mode.col80 !== new_mode.col80) return true;

        // double hi-res changed
        if(old_mode.dhires !== new_mode.dhires) return true;

        // mixed mode changed
        if(old_mode.mixed !== new_mode.mixed) return true;

        return false;
    }

    // check if address is in currently visible on display
    _is_address_visible(address, is_aux) {
        if(this.mode.text) {
            // full text mode: $400-$7ff (page 1) or $800-$bff (page 2)
            const text_base = this._get_text_base();
            const in_range = address >= text_base && address < text_base + 0x400;

            if(this.mode.col80) {
                // 80-column: both main and aux visible
                return in_range;
            } else {
                // 40-column: only main visible
                return in_range && !is_aux;
            }
        } else {
            // graphics mode - check both graphics memory and mixed-mode text

            // 1. check graphics memory (lo-res or hi-res)
            let is_graphics_visible = false;
            if(this._mem.dms_hires) {
                // hi-res: $2000-$3fff (page 1) or $4000-$5fff (page 2)
                const hires_base = this._get_hires_base();
                const in_range = address >= hires_base && address < hires_base + 0x2000;

                if(this.mode.dhires) {
                    // double hi-res: both main and aux visible
                    is_graphics_visible = in_range;
                } else {
                    // regular hires: only main visible
                    is_graphics_visible = in_range && !is_aux;
                }
            } else {
                // lo-res: $400-$7ff (page 1) or $800-$bff (page 2) - same as text
                const lores_base = this._get_text_base();
                const in_range = address >= lores_base && address < lores_base + 0x400;

                if(this.mode.col80) {
                    // 80-column lo-res: both main and aux visible
                    is_graphics_visible = in_range;
                } else {
                    // 40-column lo-res: only main visible
                    is_graphics_visible = in_range && !is_aux;
                }
            }

            // 2. check mixed-mode text area (bottom 4 rows)
            let is_mixed_text_visible = false;
            if(this.mode.mixed) {
                const text_base = this._get_text_base();
                if(address >= text_base && address < text_base + 0x400) {
                    const offset = address - text_base;
                    if(this._is_mixed_text_offset(offset)) {
                        // address is in rows 20-23
                        if(this.mode.col80) {
                            is_mixed_text_visible = true;    // both main and aux visible
                        } else {
                            is_mixed_text_visible = !is_aux; // only main visible
                        }
                    }
                }
            }

            return is_graphics_visible || is_mixed_text_visible;
        }
    }

    _get_text_base() {
        // 80STORE affects page selection
        const usePage2 = this._mem.dms_page2 && !this._mem.dms_80store;
        return usePage2 ? 0x0800 : 0x0400;
    }

    _get_hires_base() {
        // 80STORE affects page selection
        const usePage2 = this._mem.dms_page2 && !this._mem.dms_80store;
        return usePage2 ? 0x4000 : 0x2000;
    }

    _is_mixed_text_offset(offset) {
        // check if offset is within rows 20-23 of the text page
        // rows 20-23 have specific offsets in the interleaved text memory
        for(let row = 20; row < 24; row++) {
            if(offset >= this._text_offsets[row] && offset < this._text_offsets[row] + 40) {
                return true;
            }
        }
        return false;
    }

    // called when memory flags (PAGE2/HIRES/80STORE) change
    // re-renders only if the visible memory region actually changed
    _on_flag_change() {
        // Capture current mode to check if visible memory changed
        const current_mode = this._capture_mode();

        // check if the visible memory region changed
        // this handles PAGE2/HIRES/80STORE interactions correctly
        // (e.g., PAGE2 doesn't change visible page when 80STORE is on)
        if(!this._last_mode || this._visible_memory_changed(this._last_mode, current_mode)) {
            this._full_render();
        }

        this._last_mode = current_mode;
    }

    // full refresh of visible content
    _full_render() {
        // determine which page to render
        const page_num = (this._mem.dms_page2 && !this._mem.dms_80store) ? 2 : 1;

        // clear framebuffer if page not initialized
        if(page_num == 1 && !this._page1_init) {
            this._framebuffer.fill(this.BLACK);
            this._page1_init = true;
        } else if(page_num == 2 && !this._page2_init) {
            this._framebuffer.fill(this.BLACK);
            this._page2_init = true;
        }

        // Full refresh of visible content
        if(this.mode.text) {
            // text mode
            this._refresh_text();
        } else {
            // graphics modes
            if(this._mem.dms_hires) {
                if(this.mode.dhires) {
                    this._refresh_dhires();
                } else {
                    this._refresh_hires();
                }
            } else {
                // lo-res mode
                this._refresh_lores();
            }

            // if mixed mode is on, render text on bottom 4 rows
            if(this.mode.mixed) {
                this._refresh_text_mixed();
            }
        }
    }

    ////////////////////////////////////////////
    // text rendering
    ////////////////////////////////////////////

    // render visible text to framebuffer
    _refresh_text() {
        const text_base = this._get_text_base();

        for(let row = 0; row < 24; row++) {
            const addr = text_base + this._text_offsets[row];

            if(this.mode.col80) {
                // 80-column mode
                for(let col = 0; col < 40; col++) {
                    const aux_ch = this._mem._aux[addr + col];
                    const main_ch = this._mem._main[addr + col];
                    this._draw_char_80(row, col * 2, aux_ch);
                    this._draw_char_80(row, col * 2 + 1, main_ch);
                }
            } else {
                // 40-column mode
                for(let col = 0; col < 40; col++) {
                    const char_code = this._mem._main[addr + col];
                    this._draw_char_40(row, col, char_code);
                }
            }
        }
    }

    ////////////////////////////////////////////
    // text / graphics rendering
    ////////////////////////////////////////////

    // render only bottom 4 rows (20-23) as text for mixed mode
    _refresh_text_mixed() {
        const text_base = this._get_text_base();

        for(let row = 20; row < 24; row++) {
            const addr = text_base + this._text_offsets[row];

            if(this.mode.col80) {
                // 80-column mode
                for(let col = 0; col < 40; col++) {
                    const aux_ch = this._mem._aux[addr + col];
                    const main_ch = this._mem._main[addr + col];
                    this._draw_char_80(row, col * 2, aux_ch);
                    this._draw_char_80(row, col * 2 + 1, main_ch);
                }
            } else {
                // 40-column mode
                for(let col = 0; col < 40; col++) {
                    const char_code = this._mem._main[addr + col];
                    this._draw_char_40(row, col, char_code);
                }
            }
        }
    }

    ////////////////////////////////////////////
    // hires graphics rendering
    ////////////////////////////////////////////

    // render all visible hires to framebuffer (280x192 stretched to 560x192)
    _refresh_hires() {
        const hires_base = this._get_hires_base();

        for(let row = 0; row < 192; row++) {
            const addr = hires_base + this._hires_offsets[row];
            const row_offset = row * 560;

            for(let col = 0; col < 40; col++) {
                const val = this._mem._main[addr + col];

                // use apple color artifact system with 3-bit pattern matching
                // select color group based on bit 7
                const color_group = this._hires_color_groups[(val & 0x80) ? 1 : 0];

                // read neighbor bytes for edge pixel color evaluation
                const prev = (col < 1) ? 0 : this._mem._main[addr + col - 1];
                const next = (col > 38) ? 0 : this._mem._main[addr + col + 1];

                // build 11-bit value: prev[6,5] + val[6:0] + next[1,0]
                //     <--- read ---
                // nnnnnnncccccccppppppp
                // 654321065432106543210
                //      ^^^^^^^^^^^
                const bits = (next << 9) | ((val << 2) & 0x1fc) | ((prev >> 5) & 0x03);

                // evaluate 9 pixels using 3-bit sliding window (with 1-pixel overlap on each side)
                const pixel_x = col * 14;
                let oe = col & 0x01;  // Even/odd column

                for(let p = 0; p < 9; p++) {
                    const pattern = (bits >> p) & 0x07;
                    const color = color_group[oe][pattern];
                    const x = pixel_x + p * 2 - 1;  // -1 because first pixel is overlap from prev column

                    // write 2 pixels (doubled horizontally)
                    if(x >= 0 && x < 560) this._framebuffer[row_offset + x] = color;
                    if(x + 1 >= 0 && x + 1 < 560) this._framebuffer[row_offset + x + 1] = color;

                    oe ^= 1;  // toggle even/odd
                }
            }
        }
    }

    ////////////////////////////////////////////
    // double hires graphics rendering
    ////////////////////////////////////////////

    // render all visible double-hires to framebuffer (560x192, 16 colors)
    // use apple double-hires format: 7 pixel groups from 4 bytes (2 addresses, 2 banks)
    // memory layout:       main     aux
    //              2000: xddccccb xbbbaaaa
    //              2001: xggggfff xfeeeedd
    _refresh_dhires() {
        const hires_base = this._get_hires_base();

        for(let row = 0; row < 192; row++) {
            const addr = hires_base + this._hires_offsets[row];
            const row_offset = row * 560;

            // process in pairs (even/odd addresses)
            for(let col = 0; col < 40; col += 2) {
                // read 4 bytes: 2 addresses x 2 banks
                const b0 = this._mem._aux[addr + col];      // aux[even]
                const b1 = this._mem._main[addr + col];     // main[even]
                const b2 = this._mem._aux[addr + col + 1];  // aux[odd]
                const b3 = this._mem._main[addr + col + 1]; // main[odd]

                // extract 7 pixel groups (each 4 bits, each drawn as 4 pixels wide)
                const colors = [
                    // pixel a: aaaa from aux[even]
                    ((b0 << 1) & 0x0e) | ((b0 >> 3) & 0x01),
                    // pixel b: bbbb from aux[even] and main[even]
                    ((b0 >> 3) & 0x0e) | (b1 & 0x01),
                    // pixel c: cccc from main[even]
                    (b1 & 0x0e) | ((b1 >> 4) & 0x01),
                    // pixel d: dddd from main[even] and aux[odd]
                    ((b2 << 3) & 0x08) | ((b1 >> 4) & 0x06) | ((b2 >> 1) & 0x01),
                    // pixel e: eeee from aux[odd]
                    ((b2 >> 1) & 0x0e) | ((b2 >> 5) & 0x01),
                    // pixel f: ffff from aux[odd] and main[odd]
                    ((b3 << 2) & 0x0c) | ((b2 >> 5) & 0x02) | ((b3 >> 2) & 0x01),
                    // pixel g: gggg from main[odd]
                    ((b3 >> 2) & 0x0e) | ((b3 >> 6) & 0x01)
                ];

                // draw 7 pixel groups (each 4 pixels wide) = 28 pixels total
                // pixel_x is based on pair number (col/2), not column number
                const pixel_x = (col >> 1) * 28;
                for(let p = 0; p < 7; p++) {
                    const color = colors[p];
                    const x = pixel_x + p * 4;
                    // write 4 pixels per group
                    this._framebuffer[row_offset + x] = color;
                    this._framebuffer[row_offset + x + 1] = color;
                    this._framebuffer[row_offset + x + 2] = color;
                    this._framebuffer[row_offset + x + 3] = color;
                }
            }
        }
    }

    // incremental updates (write-triggered)
    _update_pixels_for_address(address, value, is_aux) {
        if(this.mode.text) {
            // text mode
            this._update_text(address, value, is_aux);
        } else {
            // graphics mode
            // check if this is a mixed-mode text update (rows 20-23)
            if(this.mode.mixed) {
                const text_base = this._get_text_base();
                if(address >= text_base && address < text_base + 0x400) {
                    const offset = address - text_base;
                    if(this._is_mixed_text_offset(offset)) {
                        // update as text
                        this._update_text(address, value, is_aux);
                        return;
                    }
                }
            }

            // update as graphics
            if(this._mem.dms_hires) {
                if(this.mode.dhires) {
                    this._update_dhires(address, value, is_aux);
                } else {
                    this._update_hires(address, value, is_aux);
                }
            } else {
                // lo-res updates
                this._update_lores(address, value, is_aux);
            }
        }
    }

    _update_text(address, value, is_aux) {
        const text_base = this._get_text_base();
        const offset = address - text_base;

        // find which row this offset belongs to by searching _text_offsets
        let row = -1;
        for(let r = 0; r < 24; r++) {
            if(offset >= this._text_offsets[r] && offset < this._text_offsets[r] + 40) {
                row = r;
                break;
            }
        }

        if(row === -1) return; // address not in text range

        const col = offset - this._text_offsets[row];

        if(this.mode.col80) {
            // 80-column mode: displays aux and main bytes side-by-side
            // refresh both characters at this position
            // use 'value' for the byte being written, read memory for the other
            const aux_ch = is_aux ? value : this._mem._aux[address];
            const main_ch = !is_aux ? value : this._mem._main[address];

            this._draw_char_80(row, col * 2, aux_ch);
            this._draw_char_80(row, col * 2 + 1, main_ch);
        } else {
            // 40-column mode
            this._draw_char_40(row, col, value);
        }
    }

    // incremental update: re-render single byte (14 pixels) using color artifacts
    _update_hires(address, value) {
        const hires_base = this._get_hires_base();
        const offset = address - hires_base;

        // find which row this address belongs to
        let row = -1;
        for(let r = 0; r < 192; r++) {
            const line_offset = this._hires_offsets[r];
            if(offset >= line_offset && offset < line_offset + 40) {
                row = r;
                break;
            }
        }

        if(row === -1) return; // address not in visible hires range

        const col = offset - this._hires_offsets[row];
        const addr = hires_base + this._hires_offsets[row];

        // select color group based on bit 7
        const color_group = this._hires_color_groups[(value & 0x80) ? 1 : 0];

        // read neighbor bytes for edge pixel color evaluation
        const prev = (col < 1) ? 0 : this._mem._main[addr + col - 1];
        const next = (col > 38) ? 0 : this._mem._main[addr + col + 1];

        // build 11-bit value: prev[6,5] + val[6:0] + next[1,0]
        const bits = (next << 9) | ((value << 2) & 0x1fc) | ((prev >> 5) & 0x03);

        // evaluate 9 pixels using 3-bit sliding window
        const row_offset = row * 560;
        const pixel_x = col * 14;
        let oe = col & 0x01;  // even/odd column

        for(let p = 0; p < 9; p++) {
            const pattern = (bits >> p) & 0x07;
            const color = color_group[oe][pattern];
            const x = pixel_x + p * 2 - 1;  // -1 for overlap

            // write 2 pixels (doubled horizontally)
            if(x >= 0 && x < 560) this._framebuffer[row_offset + x] = color;
            if(x + 1 >= 0 && x + 1 < 560) this._framebuffer[row_offset + x + 1] = color;

            oe ^= 1;  // toggle even/odd
        }
    }

    // incremental update: re-render 14-pixel group (uses 2 addresses, 4 bytes)
    // when any of the 4 bytes changes, redraw the entire group
    _update_dhires(address, value, is_aux) {
        const hires_base = this._get_hires_base();
        const offset = address - hires_base;

        // find which row this address belongs to
        let row = -1;
        for(let r = 0; r < 192; r++) {
            const line_offset = this._hires_offsets[r];
            if(offset >= line_offset && offset < line_offset + 40) {
                row = r;
                break;
            }
        }

        if(row === -1) return; // address not in visible hires range

        const col = offset - this._hires_offsets[row];
        const addr = hires_base + this._hires_offsets[row];

        // round down to even column (groups are processed in pairs)
        const col_even = col & 0xfe;

        // read all 4 bytes (use 'value' for the one being written)
        const addr_even = addr + col_even;
        const addr_odd = addr + col_even + 1;

        let b0, b1, b2, b3;
        if(col === col_even && is_aux) {
            b0 = value;
            b1 = this._mem._main[addr_even];
            b2 = this._mem._aux[addr_odd];
            b3 = this._mem._main[addr_odd];
        } else if(col === col_even && !is_aux) {
            b0 = this._mem._aux[addr_even];
            b1 = value;
            b2 = this._mem._aux[addr_odd];
            b3 = this._mem._main[addr_odd];
        } else if(col !== col_even && is_aux) {
            b0 = this._mem._aux[addr_even];
            b1 = this._mem._main[addr_even];
            b2 = value;
            b3 = this._mem._main[addr_odd];
        } else {  // col !== col_even && !is_aux
            b0 = this._mem._aux[addr_even];
            b1 = this._mem._main[addr_even];
            b2 = this._mem._aux[addr_odd];
            b3 = value;
        }

        // extract 7 pixel groups (each 4 bits, each drawn as 4 pixels wide)
        const colors = [
            ((b0 << 1) & 0x0e) | ((b0 >> 3) & 0x01),  // Pixel a
            ((b0 >> 3) & 0x0e) | (b1 & 0x01),         // Pixel b
            (b1 & 0x0e) | ((b1 >> 4) & 0x01),         // Pixel c
            ((b2 << 3) & 0x08) | ((b1 >> 4) & 0x06) | ((b2 >> 1) & 0x01),  // Pixel d
            ((b2 >> 1) & 0x0e) | ((b2 >> 5) & 0x01),  // Pixel e
            ((b3 << 2) & 0x0c) | ((b2 >> 5) & 0x02) | ((b3 >> 2) & 0x01),  // Pixel f
            ((b3 >> 2) & 0x0e) | ((b3 >> 6) & 0x01)   // Pixel g
        ];

        // draw 7 pixel groups (each 4 pixels wide) = 28 pixels total
        const row_offset = row * 560;
        // pixel_x is based on pair number (col_even/2), not column number
        const pixel_x = (col_even >> 1) * 28;
        for(let p = 0; p < 7; p++) {
            const color = colors[p];
            const x = pixel_x + p * 4;
            // write 4 pixels per group
            this._framebuffer[row_offset + x] = color;
            this._framebuffer[row_offset + x + 1] = color;
            this._framebuffer[row_offset + x + 2] = color;
            this._framebuffer[row_offset + x + 3] = color;
        }
    }

    // draw a 40-column character to the framebuffer
    _draw_char_40(row, col, char_code) {
        const is_inverse = (char_code >= 0x00 && char_code <= 0x3f);
        const is_flash = (char_code >= 0x40 && char_code <= 0x7f);

        // determine colors
        let fg_color, bg_color;
        if(is_inverse) {
            fg_color = this.BLACK;
            bg_color = this.WHITE;
        } else if(is_flash) {
            fg_color = this.WHITE;
            bg_color = this.BLACK;
        } else {
            fg_color = this.WHITE;
            bg_color = this.BLACK;
        }

        // apple iie character rom addressing
        // simple linear addressing: all 256 characters in sequence
        // offset = (char_code << 3) | scanline
        const char_base = char_code << 3;

        // render to framebuffer
        const pixel_row = row * 8;
        const pixel_col = col * 14;

        for(let scanline = 0; scanline < 8; scanline++) {
            let bitmap = this._font_rom[char_base + scanline];

            if(is_inverse) {
                bitmap = (~bitmap) & 0x7f;  // invert and mask to 7 bits
            }

            const y = pixel_row + scanline;
            const row_offset = y * 560 + pixel_col;

            // 7 bits, doubled horizontally = 14 pixels
            // note: apple iie font rom: 0 means foreground, 1 means background
            for(let bit = 0; bit < 7; bit++) {
                const pixel_on = (bitmap >> bit) & 1;
                const color = pixel_on ? bg_color : fg_color;
                const x = bit * 2;
                this._framebuffer[row_offset + x] = color;
                this._framebuffer[row_offset + x + 1] = color;
            }
        }
    }

    // draw an 80-column character to the framebuffer
    _draw_char_80(row, col, char_code) {
        const is_inverse = (char_code >= 0x00 && char_code <= 0x3f);
        const is_flash = (char_code >= 0x40 && char_code <= 0x7f);

        // determine colors
        let fg_color, bg_color;
        if(is_inverse) {
            fg_color = this.BLACK;
            bg_color = this.WHITE;
        } else if(is_flash) {
            // TODO: implement flashing
            fg_color = this.WHITE;
            bg_color = this.BLACK;
        } else {
            fg_color = this.WHITE;
            bg_color = this.BLACK;
        }

        // apple iie character rom addressing
        // simple linear addressing: all 256 characters in sequence
        // offset = (char_code << 3) | scanline
        const char_base = char_code << 3;

        // render to framebuffer
        const pixel_row = row * 8;
        const pixel_col = col * 7;

        for(let scanline = 0; scanline < 8; scanline++) {
            let bitmap = this._font_rom[char_base + scanline];

            if(is_inverse) {
                bitmap = (~bitmap) & 0x7f;  // invert and mask to 7 bits
            }

            const y = pixel_row + scanline;
            const row_offset = y * 560 + pixel_col;

            // 7 bits
            // note: apple iie font rom: 0 means foreground, 1 means background
            for(let bit = 0; bit < 7; bit++) {
                const pixel_on = (bitmap >> bit) & 1;
                const color = pixel_on ? bg_color : fg_color;  // INVERTED!
                this._framebuffer[row_offset + bit] = color;
            }
        }
    }

    ////////////////////////////////////////////
    // lo-res rendering
    ////////////////////////////////////////////

    _refresh_lores() {
        const lores_base = this._get_text_base(); // lo-res uses same memory as text

        if(this.mode.col80) {
            // 80-column lo-res
            for(let row = 0; row < 24; row++) {
                const row_offset = this._text_offsets[row];
                for(let col = 0; col < 40; col++) {
                    const addr = lores_base + row_offset + col;
                    const val_aux = this._mem._aux[addr];
                    const val_main = this._mem._main[addr];
                    this._draw_lores_cell_80(row, col, val_aux, val_main);
                }
            }
        } else {
            // 40-column lo-res
            for(let row = 0; row < 24; row++) {
                const row_offset = this._text_offsets[row];
                for(let col = 0; col < 40; col++) {
                    const addr = lores_base + row_offset + col;
                    const val = this._mem._main[addr];
                    this._draw_lores_cell_40(row, col, val);
                }
            }
        }
    }

    _update_lores(address, value, is_aux) {
        const lores_base = this._get_text_base();
        const offset = address - lores_base;

        // find which row this offset belongs to
        let row = -1;
        for(let r = 0; r < 24; r++) {
            if(offset >= this._text_offsets[r] && offset < this._text_offsets[r] + 40) {
                row = r;
                break;
            }
        }

        if(row === -1) return; // Address not in lo-res range

        const col = offset - this._text_offsets[row];

        if(this.mode.col80) {
            // 80-column mode: update both aux and main bytes
            const aux_val = is_aux ? value : this._mem._aux[address];
            const main_val = !is_aux ? value : this._mem._main[address];
            this._draw_lores_cell_80(row, col, aux_val, main_val);
        } else {
            // 40-column mode: only update if writing to main memory
            if(!is_aux) {
                this._draw_lores_cell_40(row, col, value);
            }
        }
    }

    _draw_lores_cell_40(row, col, val) {
        // lo-res: low nibble = top half, high nibble = bottom half
        const color_top = val & 0x0f;
        const color_bottom = (val >> 4) & 0x0f;

        // each cell is 14 pixels wide (7 pixels doubled), 8 pixels tall
        // split into two 4-pixel tall half-blocks
        const x_start = col * 14;
        const y_top = row * 8;
        const y_bottom = y_top + 4;

        // draw top half (4 rows)
        for(let y = 0; y < 4; y++) {
            const row_offset = (y_top + y) * 560 + x_start;
            for(let x = 0; x < 14; x++) {
                this._framebuffer[row_offset + x] = color_top;
            }
        }

        // draw bottom half (4 rows)
        for(let y = 0; y < 4; y++) {
            const row_offset = (y_bottom + y) * 560 + x_start;
            for(let x = 0; x < 14; x++) {
                this._framebuffer[row_offset + x] = color_bottom;
            }
        }
    }

    _draw_lores_cell_80(row, col, val_aux, val_main) {
        // 80-column lo-res: aux byte is left half, main byte is right half
        const color_top_aux = val_aux & 0x0f;
        const color_bottom_aux = (val_aux >> 4) & 0x0f;
        const color_top_main = val_main & 0x0f;
        const color_bottom_main = (val_main >> 4) & 0x0f;

        // each cell is 7 pixels wide, 8 pixels tall
        const x_aux = col * 14;      // aux byte (left half)
        const x_main = col * 14 + 7; // main byte (right half)
        const y_top = row * 8;
        const y_bottom = y_top + 4;

        // draw aux byte (left half)
        // top half
        for(let y = 0; y < 4; y++) {
            const row_offset = (y_top + y) * 560 + x_aux;
            for(let x = 0; x < 7; x++) {
                this._framebuffer[row_offset + x] = color_top_aux;
            }
        }
        // bottom half
        for(let y = 0; y < 4; y++) {
            const row_offset = (y_bottom + y) * 560 + x_aux;
            for(let x = 0; x < 7; x++) {
                this._framebuffer[row_offset + x] = color_bottom_aux;
            }
        }

        // draw main byte (right half)
        // top half
        for(let y = 0; y < 4; y++) {
            const row_offset = (y_top + y) * 560 + x_main;
            for(let x = 0; x < 7; x++) {
                this._framebuffer[row_offset + x] = color_top_main;
            }
        }
        // bottom half
        for(let y = 0; y < 4; y++) {
            const row_offset = (y_bottom + y) * 560 + x_main;
            for(let x = 0; x < 7; x++) {
                this._framebuffer[row_offset + x] = color_bottom_main;
            }
        }
    }
}
