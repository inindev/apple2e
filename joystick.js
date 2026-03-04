//
//  joystick wrapper for browser gamepad
//
//  Copyright 2018-2026, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//

// standard mapping per the Gamepad API spec - indices are consistent
// across controller brands (Nintendo, Xbox, PlayStation, etc.)
const standard = {
    button0: 0,  // bottom face button (B on Nintendo, A on Xbox, Cross on PS)
    button1: 1,  // right face button (A on Nintendo, B on Xbox, Circle on PS)
    button2: 2,  // left face button (Y on Nintendo, X on Xbox, Square on PS)
    axis0: 0,    // left stick X
    axis1: 1,    // left stick Y
    axis2: 2,    // right stick X
    axis3: 3     // right stick Y
};

const ps4 = {
    button0: 2,
    button1: 0,
    button2: 1,
    axis0: 0,
    axis1: 1,
    axis2: 2,
    axis3: 3
};

// default for non-standard gamepads (Nintendo-style USB)
const default_mapping = {
    button0: 3,  // Y (top)
    button1: 0,  // X (left)
    button2: 2,  // B (right)
    axis0: 0,
    axis1: 1,
    axis2: 0,
    axis3: 1
};

// vendor-specific overrides for non-standard gamepads
const vendor_mappings = {
    "054c": ps4,  // Sony
};


export class Joystick
{
    constructor() {
        this._gamepad_index = -1;
        this._mapping = standard;
    }

    connect(gamepad) {
        this._gamepad_index = gamepad.index;
        if(gamepad.mapping === "standard") {
            this._mapping = standard;
        } else {
            const vendor = (gamepad.id.match(/Vendor:\s*([0-9a-f]{4})/i) || [])[1];
            this._mapping = (vendor && vendor_mappings[vendor]) || default_mapping;
        }
    }

    disconnect(gamepad) {
        if(this._gamepad_index === gamepad.index) {
            this._gamepad_index = -1;
        }
    }

    get gamepad() {
        if(this._gamepad_index < 0) return undefined;
        return navigator.getGamepads()[this._gamepad_index];
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
        const idx = this._mapping[btn];
        return this.gamepad.buttons[idx].pressed;
    }

    get_axis_value(axis) {
        if(!this.gamepad) return 128;
        const idx = this._mapping[axis];
        let val = Math.floor((this.gamepad.axes[idx] * 128) + 128);
        if(val < 0) val = 0;
        if(val > 255) val = 255;
        if((val > 122) && (val < 133)) val = 128;
        return val;
    }
}
