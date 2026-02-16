//
//  apple2e audio output device
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
//
//  Apple II speaker is a 1-bit toggle ($C030). Each access flips the
//  speaker cone. We use a ConstantSourceNode feeding a GainNode and
//  schedule gain changes at cycle-accurate times via setValueAtTime().
//  Output is centered around zero (+/- level/2) to eliminate DC bias.
//


export class AppleAudio
{
    constructor(khz) {
        this.ac = null;
        this.gn = null;
        this.cpu_hz = khz * 1000;
        this.seg_time = 0;
        this.seg_clock = 0;
        this.state = false;
        this.level = 0.6;
        this.level_last = 0.6;
        this.on_mute_change = null;
    }

    init() {
        if(this.ac) return;
        this.ac = new (window.AudioContext || window.webkitAudioContext)();

        const src = this.ac.createConstantSource();
        src.offset.value = 1.0;
        this.gn = this.ac.createGain();
        this.gn.gain.value = 0;

        src.connect(this.gn);
        this.gn.connect(this.ac.destination);
        src.start();

        // unmute
        this.level = 0.6;
        this.level_last = 0.6;
        if(this.on_mute_change) this.on_mute_change(false);
    }

    get muted() {
        return (this.level == 0) || !this.ac;
    }

    set muted(val) {
        if(!val) { // unmute
            if(!this.ac) {
                this.init();
                return;
            }
            if(this.ac) {
                if(this.level_last < 0.1) {
                    this.level_last = 0.6;
                }
                this.level = this.level_last;
            }
        }
        else { // mute
            this.level_last = this.level;
            this.level = 0.0;
        }

        if(this.on_mute_change) this.on_mute_change(this.muted);
    }

    begin_segment(clock) {
        if((this.level == 0) || !this.ac) return;
        this.seg_time = this.ac.currentTime + 0.08; // schedule ahead for glitch-free playback
        this.seg_clock = clock;
    }

    click(clock) {
        if((this.level == 0) || !this.gn) return;
        this.state = !this.state;
        const time = (clock - this.seg_clock) / this.cpu_hz;
        const half = this.level * 0.5;
        this.gn.gain.setValueAtTime(this.state ? half : -half, time + this.seg_time);
    }

    reset() {
        if(!this.gn) return;
        this.state = false;
        this.gn.gain.cancelScheduledValues(0);
        this.gn.gain.value = 0;
    }
}
