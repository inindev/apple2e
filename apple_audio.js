//
//  apple2e audio output device
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//


export class AppleAudio
{
    constructor() {
        this.ac;
        this.gn;
        this.cpu_hz = 1024000;
        this.seg_time = 0;
        this.seg_clock = 0;
        this.state = false;
        this.level = 1;
    }

    init() {
        this.ac = new AudioContext();
        const osc = new OscillatorNode(this.ac, {channelCount:1, channelCountMode:"explicit", frequency:0});
        const ws = new WaveShaperNode(this.ac, {channelCount:1, channelCountMode:"explicit"});
        ws.curve = new Float32Array([-1, -1]);
        this.gn = new GainNode(this.ac, {channelCount:1, channelCountMode:"explicit", gain:0});

        osc.connect(ws);
        ws.connect(this.gn);
        this.gn.connect(this.ac.destination);
        osc.start();
    }

    begin_segment(clock) {
        this.seg_time = this.ac.currentTime + 0.08; // gameplay is in the future
        this.seg_clock = clock;
    }

    click(clock) {
        this.state = !this.state;
        const time = (clock - this.seg_clock) / this.cpu_hz;
        this.gn.gain.setValueAtTime(this.state ? this.level : 0, time + this.seg_time);
    }
}

