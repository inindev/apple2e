//
//  apple2e audio output device
//
//  Copyright 2018-2026, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
//
// Apple II speaker hardware uses a 1-bit toggle ($C030); each access
// flips the cone position. An AudioWorklet generates samples on the
// audio thread based on toggle timestamps received via postMessage.
// Output is centered around zero (+/-level/2) to eliminate DC offset.
//

const PROCESSOR_CODE = `
class AppleSpeakerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.state = false;
        this.level = 0.6;
        this.queue = [];
        this.idle_samples = 0;
        this.idle_threshold = 0;
        this.fade_length = 0;
        this.port.onmessage = (e) => {
            const msg = e.data;
            if(msg.type === 'toggle') {
                this.queue.push(msg.time);
            } else if(msg.type === 'level') {
                this.level = msg.value;
            } else if(msg.type === 'reset') {
                this.queue.length = 0;
                this.state = false;
                this.idle_samples = this.idle_threshold + 1;
            }
        };
    }

    process(inputs, outputs) {
        const output = outputs[0][0];
        const len = output.length;

        if(this.idle_threshold === 0) {
            this.idle_threshold = (sampleRate * 0.1) | 0;  // ~100ms
            this.fade_length = (sampleRate * 0.005) | 0;   // ~5ms fade-out
        }

        const fade_start = this.idle_threshold;
        const fade_end = fade_start + this.fade_length;

        if(this.level === 0 || (this.queue.length === 0 && this.idle_samples > fade_end)) {
            return true;
        }

        const half = this.level * 0.5;
        let qi = 0;

        for(let i = 0; i < len; i++) {
            const t = currentTime + i / sampleRate;
            while(qi < this.queue.length && this.queue[qi] <= t) {
                this.state = !this.state;
                this.idle_samples = 0;
                qi++;
            }
            const val = this.state ? half : -half;
            if(this.idle_samples <= fade_start) {
                output[i] = val;
            } else if(this.idle_samples <= fade_end) {
                output[i] = val * (1 - (this.idle_samples - fade_start) / this.fade_length);
            }
            this.idle_samples++;
        }

        if(qi > 0) this.queue.splice(0, qi);
        return true;
    }
}
registerProcessor('apple-speaker', AppleSpeakerProcessor);
`;


export class AppleAudio
{
    constructor(khz) {
        this.ac = null;
        this.node = null;
        this._init_busy = false;
        this.cpu_hz = khz * 1000;
        this.seg_time = 0;
        this.seg_clock = 0;
        this._level = 0.6;
        this.level_last = 0.6;
        this.on_mute_change = null;
    }

    get level() { return this._level; }
    set level(val) {
        this._level = val;
        if(this.node) this.node.port.postMessage({type: 'level', value: val});
    }

    init() {
        if(this._init_busy || this.ac) return;
        this._init_busy = true;
        this._do_init();
    }

    async _do_init() {
        try {
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            const blob = new Blob([PROCESSOR_CODE], {type: 'application/javascript'});
            const url = URL.createObjectURL(blob);
            await ac.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);
            const node = new AudioWorkletNode(ac, 'apple-speaker');
            node.connect(ac.destination);
            node.port.postMessage({type: 'level', value: this._level});
            this.node = node;
            this.ac = ac;
            // unmute
            this.level = 0.6;
            this.level_last = 0.6;
            if(this.on_mute_change) this.on_mute_change(false);
        } finally {
            this._init_busy = false;
        }
    }

    get muted() {
        return (this._level == 0) || !this.ac;
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
            this.level_last = this._level;
            this.level = 0.0;
        }

        if(this.on_mute_change) this.on_mute_change(this.muted);
    }

    begin_segment(clock) {
        if(!this.node || this._level == 0) return;
        this.seg_time = this.ac.currentTime + 0.08;
        this.seg_clock = clock;
    }

    click(clock) {
        if(!this.node || this._level == 0) return;
        const time = this.seg_time + (clock - this.seg_clock) / this.cpu_hz;
        this.node.port.postMessage({type: 'toggle', time: time});
    }

    reset() {
        if(!this.node) return;
        this.node.port.postMessage({type: 'reset'});
    }
}
