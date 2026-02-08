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
import {Display} from "./display.js";
import {CanvasRenderer} from "./canvas_renderer.js";
import {Keyboard} from "./keyboard.js";
import {Floppy525} from "./floppy525.js";
import {AppleAudio} from "./apple_audio.js";
import {Joystick} from "./joystick.js";
import {rom_342_0304_cd} from "./rom/342-0304-cd.js";
import {rom_342_0303_ef} from "./rom/342-0303-ef.js";


export class Motherboard
{
    constructor(khz, canvas, floppy_led_cb) {
        this.memory = new Memory(rom_342_0304_cd, rom_342_0303_ef);
        this.cpu = new W65C02S(this.memory);
        this.keyboard = new Keyboard();

        // create video system (framebuffer only)
        this.video = new Display(this.memory);

        // create renderer (canvas output)
        this.renderer = new CanvasRenderer(canvas, this.video);

        this.floppy525 = new Floppy525(6, this.memory, floppy_led_cb);
        this.audio = new AppleAudio(khz);
        this.joystick = new Joystick();
        this.io_manager = new IOManager(this.memory, this.keyboard, this.video,
                                        this.audio_click.bind(this), this.joystick);

        this.cycles = 0;
    }

    clock(count) {
        this.audio.begin_segment(this.cycles);
        const total = this.cycles + count;
        while(this.cycles < total) {
            this.cycles += this.cpu.step();
        }
    }

    audio_click() {
        this.audio.click(this.cycles);
    }

    reset(cold) {
        if(cold) this.memory.reset();
        this.cpu.reset();
        this.io_manager.reset();
        this.video.reset();
        this.floppy525.reset();
        this.audio.reset();

        this.cycles = 0;
        this.cpu.register.pc = this.memory.read_word(0xfffc);
    }

    // write message to text page 1
    set message(text) {
        const addr = 0x43b - ((text.length / 2) & 0x0f);
        for(let i=0; i<text.length; i++) this.memory.write(addr+i, text.charCodeAt(i)+0x80);
        this.renderer.render_frame();
    }
}

