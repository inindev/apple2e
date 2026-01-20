//
//  apple2e audio output device
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
//       https://github.com/WebKit/webkit/tree/master/Source/WebCore/Modules/webaudio
//


export class AppleAudio
{
    constructor(khz) {
        this.ac;
        this.gn;
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
        const osc = this.ac.createOscillator({channelCount:1, channelCountMode:"explicit", frequency:0});
        const ws = this.ac.createWaveShaper({channelCount:1, channelCountMode:"explicit"});
        ws.curve = new Float32Array([-1, -1]);
        this.gn = this.ac.createGain({channelCount:1, channelCountMode:"explicit", gain:0});

        osc.connect(ws);
        ws.connect(this.gn);
        this.gn.connect(this.ac.destination);
        osc.start();

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
        this.seg_time = this.ac.currentTime + 0.08; // gameplay is in the future
        this.seg_clock = clock;
    }

    click(clock) {
        if((this.level == 0) || !this.gn) return;
        this.state = !this.state;
        const time = (clock - this.seg_clock) / this.cpu_hz;
        this.gn.gain.setValueAtTime(this.state ? this.level : 0, time + this.seg_time);
    }

    reset() {
        if(!this.gn) return;
        this.state = false;
        this.gn.gain.cancelScheduledValues(0);
        this.gn.gain.value = 0;
    }
}

