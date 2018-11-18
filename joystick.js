//
//  joystick wrapper for browser gamepad
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//


const ps4 = {
    button0: 2,
    button1: 0,
    button2: 1,
    axis0: 0,
    axis1: 1,
    axis2: 2,
    axis3: 3
};


export class Joystick
{
    constructor() {
        this.gamepad = undefined;
    }

    get button0() {
        return this.get_button_pressed("button0");
    };

    get button1() {
        return this.get_button_pressed("button1");
    };

    get button2() {
        return this.get_button_pressed("button2");
    };

    get axis0() {
        return this.get_axis_value("axis0");
    };

    get axis1() {
        return this.get_axis_value("axis1");
    };

    get axis2() {
        return this.get_axis_value("axis2");
    };

    get axis3() {
        return this.get_axis_value("axis3");
    };

    get_button_pressed(btn) {
        if(!this.gamepad) return false;
        return this.gamepad.buttons[ps4[btn]].pressed;
    }

    get_axis_value(axis) {
        if(!this.gamepad) return 128;
        let val = Math.floor((this.gamepad.axes[ps4[axis]] * 128) + 128);
        if(val < 0) val = 0;
        if(val > 255) val = 255;
        if((val > 122) && (val < 133)) val = 128;
        return val;
    }
}

