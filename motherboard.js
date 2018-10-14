//
//  main class to tie components together
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: https://en.wikipedia.org/wiki/Apple_II_character_set
//

import {W65C02S} from "./w65c02s.js";
import {Memory} from "./memory.js";
import {IOManager} from "./io_manager.js";
import {TextDisplay} from "./text_display.js";
import {HiresDisplay} from "./hires_display.js";
import {Keyboard} from "./keyboard.js";
import {rom_342_0265_a} from "./rom/342-0265-a.js";
import {rom_342_0304_cd} from "./rom/342-0304-cd.js";
import {rom_342_0303_ef} from "./rom/342-0303-ef.js";


export class Motherboard
{
    constructor(canvas) {
        this.memory = new Memory(rom_342_0304_cd, rom_342_0303_ef);
        this.cpu = new W65C02S(this.memory);
        this.keyboard = new Keyboard();
        this.display_text = new TextDisplay(rom_342_0265_a, canvas);
        this.display_hires = new HiresDisplay(canvas);
        this.io_manager = new IOManager(this.memory, this.keyboard, this.display_text, this.display_hires);

        this.cycles = 0;
        this.memory.write(0, 0xbe);
    }

    clock(count) {
        const total = this.cycles + count;
        while(this.cycles < total) {
            this.cycles += this.cpu.step();
        }
    }

    key_down(code, shift, ctrl, meta) {
        this.keyboard.key_down(code, shift, ctrl, meta);
    }

    key_up() {
        this.keyboard.key_up();
    }

    reset(cold) {
        if(cold) this.memory.reset();
        this.cpu.reset();
        this.display_text.reset();
        this.display_hires.reset();
        this.cycles = 0;
        this.cpu.register.pc = this.memory.read_word(0xfffc);
    }

    message(text) {
        const addr = 0x43b - ((text.length / 2) & 0x0f);
        for(let i=0; i<text.length; i++) this.display_text.draw_text(this.memory, addr+i, text.charCodeAt(i)+0x80);
    }
}

