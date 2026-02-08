//
//  canvas renderer
//
//  Copyright 2018-2026, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  architecture: converts 560x192 8-bit framebuffer -> canvas output
//  - reads framebuffer from display
//  - applies scanline doubling (192 -> 384)
//  - applies palette lookup and effects
//  - centers 560x384 in 564x390 canvas with black border
//  - called at 60hz by requestAnimationFrame
//


export class CanvasRenderer
{
    constructor(canvas, video) {
        this._canvas = canvas;
        this._video = video;

        // canvas setup: 564x390 (2px left/right border, 3px top/bottom border)
        canvas.width = 564;
        canvas.height = 390;

        this._context = canvas.getContext('2d', {alpha: false});
        this._context.imageSmoothingEnabled = false;
        this._context.webkitImageSmoothingEnabled = false;

        // output buffer: 560x384 RGBA (framebuffer doubled vertically)
        this._output_image_data = this._context.createImageData(560, 384);
        this._output_pixels = new Uint32Array(this._output_image_data.data.buffer);

        // text mode
        this._text_color_mode = 2;      // 1=white, 2=green, 3=amber
        this._text_hscan = true;        // horizontal scanlines for text

        // graphics mode
        this._graphics_color_mode = 0;  // 0=color, 1=white, 2=green, 3=amber
        this._graphics_vscan = true;    // vertical scanline effect for graphics

        // color palettes (rgba)
        this._init_palettes();

        // clear canvas with black border
        this._clear_canvas();
    }

    _init_palettes() {
        // base color palette for graphics modes (16 colors, rgba32 little-endian)
        // format: 0xaabbggrr (little-endian for Uint32 view)
        this._palette_color = new Uint32Array([
            0xff111111,  // 0: black
            0xff3300dd,  // 1: dark red
            0xff990000,  // 2: dark blue
            0xffdd22dd,  // 3: purple
            0xff227700,  // 4: dark green
            0xff555555,  // 5: dark gray
            0xffff2222,  // 6: blue
            0xffffaa66,  // 7: light blue
            0xff005588,  // 8: brown
            0xff0066ff,  // 9: orange
            0xffaaaaaa,  // 10: gray
            0xff8899ff,  // 11: pink
            0xff00dd11,  // 12: green
            0xff00ffff,  // 13: yellow
            0xff99ff44,  // 14: aqua
            0xffeeeeee   // 15: white
        ]);

        // pre-compute monochrome palettes
        this._palette_mono = this._create_monochrome_palette(0xeeeeee);  // white
        this._palette_green = this._create_monochrome_palette(0x00ff66); // green phosphor
        this._palette_amber = this._create_monochrome_palette(0xffd429); // amber phosphor
    }

    // create monochrome palette by converting color palette to grayscale,
    // then tinting with the phosphor color
    _create_monochrome_palette(phosphor_rgb) {
        const mono_palette = new Uint32Array(16);

        // extract phosphor RGB components
        const phosphor_r = (phosphor_rgb >> 16) & 0xff;
        const phosphor_g = (phosphor_rgb >> 8) & 0xff;
        const phosphor_b = phosphor_rgb & 0xff;

        for(let i = 0; i < 16; i++) {
            const orig_color = this._palette_color[i];

            // extract RGB from original color (little-endian: 0xaabbggrr)
            const r = orig_color & 0xff;
            const g = (orig_color >> 8) & 0xff;
            const b = (orig_color >> 16) & 0xff;

            // calculate perceived luminance
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 0xee;

            // apply luminance to phosphor color
            const mono_r = Math.round(phosphor_r * luminance);
            const mono_g = Math.round(phosphor_g * luminance);
            const mono_b = Math.round(phosphor_b * luminance);

            // pack into RGBA32 (little-endian)
            mono_palette[i] = 0xff000000 | (mono_b << 16) | (mono_g << 8) | mono_r;
        }

        return mono_palette;
    }

    // text display mode (1=white, 2=green, 3=amber)
    get text_color_mode() {
        return this._text_color_mode;
    }
    set text_color_mode(mode) {
        if(mode < 1 || mode > 3) mode = 2; // green default
        this._text_color_mode = mode;
        this.render_frame();
    }

    // text horizontal scanlines
    get text_hscan() {
        return this._text_hscan;
    }
    set text_hscan(val) {
        this._text_hscan = (val != 0);
        this.render_frame();
    }

    // graphics display mode (0=color, 1=white, 2=green, 3=amber)
    get graphics_color_mode() {
        return this._graphics_color_mode;
    }
    set graphics_color_mode(mode) {
        if(mode < 0 || mode > 3) mode = 0; // color default
        this._graphics_color_mode = mode;
        this.render_frame();
    }

    // graphics vertical scanlines
    get graphics_vscan() {
        return this._graphics_vscan;
    }
    set graphics_vscan(val) {
        this._graphics_vscan = (val != 0);
        this.render_frame();
    }

    // output loop - called at 60Hz by requestAnimationFrame
    // converts framebuffer (560x192 palette indices) to RGBA output (560x384)
    // then centers in 564x390 canvas with black border
    render_frame() {
        // get framebuffer from video system
        const framebuffer = this._video.get_framebuffer();

        // convert framebuffer palette indices -> RGBA with scanline doubling
        this._render_framebuffer_to_output(framebuffer);

        // output to canvas (centered with border: 2px left, 3px top)
        this._context.putImageData(this._output_image_data, 2, 3);
    }

    _clear_canvas() {
        // fill entire canvas with black
        this._context.fillStyle = '#000000';
        this._context.fillRect(0, 0, 564, 390);
    }

    // convert 560x192 framebuffer (palette indices) -> 560x384 RGBA (scanline doubled)
    _render_framebuffer_to_output(framebuffer) {
        // select appropriate palette based on mode
        let palette;
        if(this._video.mode.text) {
            // text mode
            switch(this._text_color_mode) {
                case 1: palette = this._palette_mono; break;   // b&w
                case 2: palette = this._palette_green; break;  // green phosphor
                case 3: palette = this._palette_amber; break;  // amber phosphor
                default: palette = this._palette_green; break; // default to green
            }
        } else {
            // graphics mode
            switch(this._graphics_color_mode) {
                case 1: palette = this._palette_mono; break;   // b&w
                case 2: palette = this._palette_green; break;  // green phosphor
                case 3: palette = this._palette_amber; break;  // amber phosphor
                default: palette = this._palette_color; break; // full color
            }
        }

        // apply scanline doubling with optional effects
        for(let y = 0; y < 192; y++) {
            const src_row = y * 560;
            const dstRow1 = (y * 2) * 560;
            const dstRow2 = (y * 2 + 1) * 560;

            for(let x = 0; x < 560; x++) {
                const palette_index = framebuffer[src_row + x];
                let color1 = palette[palette_index];
                let color2 = color1;

                // apply scanline dimming effect
                if(this._video.mode.text && this._text_hscan) {
                    // text mode: horizontal scanlines - dim every other row
                    color2 = this._dim_hscan(color1);
                } else if(!this._video.mode.text && this._graphics_vscan && (x & 1)) {
                    // graphics mode: vertical scanlines - dim odd columns
                    color1 = this._dim_vscan(color1);
                    color2 = color1;
                }

                // write to both output rows
                this._output_pixels[dstRow1 + x] = color1;
                this._output_pixels[dstRow2 + x] = color2;
            }
        }
    }

    // dim color by 50% for scanline effect
    _dim_hscan(rgba32) {
        const r = (rgba32 & 0xff) >> 1;
        const g = ((rgba32 >> 8) & 0xff) >> 1;
        const b = ((rgba32 >> 16) & 0xff) >> 1;
        return (rgba32 & 0xff000000) | (b << 16) | (g << 8) | r;
    }

    // dim color by 25% for bright colors
    _dim_vscan(rgba32) {
        let r = rgba32 & 0xff;
        let g = (rgba32 >> 8) & 0xff;
        let b = (rgba32 >> 16) & 0xff;

        // only dim if at least one component is bright enough
        if(r > 0x22 || g > 0x22 || b > 0x22) { // skip very dark colors
            r = (r * 3) >> 2;  // * 0.75
            g = (g * 3) >> 2;
            b = (b * 3) >> 2;
        }

        return (rgba32 & 0xff000000) | (b << 16) | (g << 8) | r;
    }

    _blend_colors(color1, color2, blend_amount) {
        // blend two rgba32 colors: result = color1 * blend_amount + color2 * (1 - blend_amount)
        const r1 = color1 & 0xff;
        const g1 = (color1 >> 8) & 0xff;
        const b1 = (color1 >> 16) & 0xff;

        const r2 = color2 & 0xff;
        const g2 = (color2 >> 8) & 0xff;
        const b2 = (color2 >> 16) & 0xff;

        const r = Math.floor(r1 * blend_amount + r2 * (1 - blend_amount));
        const g = Math.floor(g1 * blend_amount + g2 * (1 - blend_amount));
        const b = Math.floor(b1 * blend_amount + b2 * (1 - blend_amount));

        return (color1 & 0xff000000) | (b << 16) | (g << 8) | r;
    }
}
