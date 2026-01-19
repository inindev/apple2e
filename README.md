# Apple IIe Emulator

A fully functional Apple IIe computer emulator written in ES6, running entirely in your web browser.

## Quick Start

### Try it Now

Click any game below to launch the emulator with that disk loaded:

**Operating Systems:**
- [ProDOS 2.4.2](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/ProDOS_2_4_2.dsk) - Apple's professional disk operating system

**Games:**
- [Adventure](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/adventure.dsk) - Classic text adventure
- [Bad Dudes](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/bad_dudes.dsk) - Action beat 'em up
- [Beyond Castle Wolfenstein](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/beyond_castle_wolfenstein.dsk) - Stealth action
- [Burgertime](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/burgertime.dsk) - Arcade classic
- [Castle Wolfenstein](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/castle_wolfenstein.dsk) - Original stealth shooter
- [Cause & Effect](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/cause_and_effect.dsk) - Puzzle game
- [Jeopardy](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/jeopardy.dsk) - Quiz game
- [Lode Runner](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/lode_runner.dsk) - Platform puzzle classic
- [Oregon Trail](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/oregon_trail_d1.dsk&u2=https://s3.us-east-2.amazonaws.com/apple2e/oregon_trail_d2.dsk) - Educational adventure (2 disks)
- [Rampage](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/rampage.dsk) - Arcade destruction
- [Star Trek](https://inindev.github.io/apple2e/index.html?u1=https://s3.us-east-2.amazonaws.com/apple2e/star_trek.dsk) - Space strategy

## Using the Emulator

### Loading and Booting Disks

**Step 1: Load a Disk**

1. Click on **"Drive 1"** (or "Drive 2") to expand the drive settings
2. Choose one of the following:
   - **Browse** - Click the browse button to select a local `.dsk` file from your computer
   - **URL** - Enter a URL to a `.dsk` file, then click "save..."

**Step 2: Boot the Disk**

3. Click the **`reset`** button to boot the disk

That's it! Most disk images will auto-boot after reset.

**Tips:**
- Hold `Shift` while clicking `reset` for a **cold reset** (clears memory) - useful if a disk won't boot
- Regular `reset` does a **warm reset** (preserves memory)
- You can also load disks via URL parameters: `?u1=URL` for Drive 1, `?u2=URL` for Drive 2

### Controls

**Keyboard:**
- Standard keyboard input works as expected
- `Ctrl` key combinations work for Apple IIe control codes
- Arrow keys are mapped appropriately

**Gamepad/Joystick:**
- Connect a gamepad (tested with PS4 controller)
- Analog sticks control paddle/joystick position
- Buttons map to Apple IIe joystick buttons

**Display:**
- `run/stop` - Pause/resume emulation
- `reset` - Reset the computer (hold Shift for cold reset)
- Volume slider - Adjust audio volume
- `full screen` - Toggle fullscreen mode
- Text/graphics color selectors - Choose display colors
- Scanline options - Toggle scanline effects for authenticity

## Features

### Emulated Hardware

- **CPU**: W65C02S processor with full instruction set
- **Memory**: 128KB with extended memory support
- **Display**:
  - Text mode (40/80 column)
  - Lo-res graphics (partial)
  - Hi-res graphics (280×192)
  - Double hi-res graphics (560×192)
- **Peripherals**:
  - 5.25" floppy disk drives (2 drives, read-only)
  - Sound/speaker
  - Joystick/gamepad support
  - Keyboard

### Current Limitations

- **Disk writing**: Not yet supported (disks are read-only)
- **Disk formats**: Only `.dsk` format supported (`.po`, `.2mg`, `.img` planned)
- **Lo-res graphics**: Partial implementation
- **Expansion cards**: Not yet implemented

## Development

### Running Locally

Start a local web server:
```bash
sh http_server.sh
```

Then navigate to `http://localhost:8000`

### Testing

The emulator includes the Klaus Dormann 6502 test suite for CPU validation. See [kd_test/README.md](kd_test/README.md) for details.

### Project Structure

- `w65c02s.js` - CPU emulation
- `memory.js` - Memory management
- `motherboard.js` - Main system integration
- `display_*.js` - Video display modes
- `floppy525.js` - Disk drive emulation
- `keyboard.js` - Keyboard input
- `joystick.js` - Gamepad support
- `apple_audio.js` - Sound emulation
- `io_manager.js` - I/O coordination

## License

Released under the GNU General Public License
https://www.gnu.org/licenses/gpl.html

---

John Clark, 2018
