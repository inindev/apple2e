//
//  W65C02S processor implementation in ECMAScript 6
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: http://www.wdesignc.com/wdc/documentation/w65c02s.pdf
//       http://www.6502.org/tutorials/vflag_html
//


// 17 address modes
//             1     2     3     4     5     6     7     8     9a   9b     10    11    12    13    14    15    16
//            abs ,absxi, absx, absy, absi, acum, imm , imp , rel ,zprel, rels,  zp , zpxi, zpx,  zpy , zpi , zpiy
const opdef = [
    [ "adc" , 0x6d,     , 0x7d, 0x79,     ,     , 0x69,     ,     ,     ,     , 0x65, 0x61, 0x75,     , 0x72, 0x71 ],
    [ "and" , 0x2d,     , 0x3d, 0x39,     ,     , 0x29,     ,     ,     ,     , 0x25, 0x21, 0x35,     , 0x32, 0x31 ],
    [ "asl" , 0x0e,     , 0x1e,     ,     , 0x0a,     ,     ,     ,     ,     , 0x06,     , 0x16,     ,     ,      ],
    [ "bbr0",     ,     ,     ,     ,     ,     ,     ,     ,     , 0x0f,     ,     ,     ,     ,     ,     ,      ],
    [ "bbr1",     ,     ,     ,     ,     ,     ,     ,     ,     , 0x1f,     ,     ,     ,     ,     ,     ,      ],
    [ "bbr2",     ,     ,     ,     ,     ,     ,     ,     ,     , 0x2f,     ,     ,     ,     ,     ,     ,      ],
    [ "bbr3",     ,     ,     ,     ,     ,     ,     ,     ,     , 0x3f,     ,     ,     ,     ,     ,     ,      ],
    [ "bbr4",     ,     ,     ,     ,     ,     ,     ,     ,     , 0x4f,     ,     ,     ,     ,     ,     ,      ],
    [ "bbr5",     ,     ,     ,     ,     ,     ,     ,     ,     , 0x5f,     ,     ,     ,     ,     ,     ,      ],
    [ "bbr6",     ,     ,     ,     ,     ,     ,     ,     ,     , 0x6f,     ,     ,     ,     ,     ,     ,      ],
    [ "bbr7",     ,     ,     ,     ,     ,     ,     ,     ,     , 0x7f,     ,     ,     ,     ,     ,     ,      ],
    [ "bbs0",     ,     ,     ,     ,     ,     ,     ,     ,     , 0x8f,     ,     ,     ,     ,     ,     ,      ],
    [ "bbs1",     ,     ,     ,     ,     ,     ,     ,     ,     , 0x9f,     ,     ,     ,     ,     ,     ,      ],
    [ "bbs2",     ,     ,     ,     ,     ,     ,     ,     ,     , 0xaf,     ,     ,     ,     ,     ,     ,      ],
    [ "bbs3",     ,     ,     ,     ,     ,     ,     ,     ,     , 0xbf,     ,     ,     ,     ,     ,     ,      ],
    [ "bbs4",     ,     ,     ,     ,     ,     ,     ,     ,     , 0xcf,     ,     ,     ,     ,     ,     ,      ],
    [ "bbs5",     ,     ,     ,     ,     ,     ,     ,     ,     , 0xdf,     ,     ,     ,     ,     ,     ,      ],
    [ "bbs6",     ,     ,     ,     ,     ,     ,     ,     ,     , 0xef,     ,     ,     ,     ,     ,     ,      ],
    [ "bbs7",     ,     ,     ,     ,     ,     ,     ,     ,     , 0xff,     ,     ,     ,     ,     ,     ,      ],
    [ "bcc" ,     ,     ,     ,     ,     ,     ,     ,     , 0x90,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "bcs" ,     ,     ,     ,     ,     ,     ,     ,     , 0xb0,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "beq" ,     ,     ,     ,     ,     ,     ,     ,     , 0xf0,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "bit" , 0x2c,     , 0x3c,     ,     ,     , 0x89,     ,     ,     ,     , 0x24,     , 0x34,     ,     ,      ],
    [ "bmi" ,     ,     ,     ,     ,     ,     ,     ,     , 0x30,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "bne" ,     ,     ,     ,     ,     ,     ,     ,     , 0xd0,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "bpl" ,     ,     ,     ,     ,     ,     ,     ,     , 0x10,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "bra" ,     ,     ,     ,     ,     ,     ,     ,     , 0x80,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "brk" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x00,     ,     ,     ,     ,     ,      ],
    [ "bvc" ,     ,     ,     ,     ,     ,     ,     ,     , 0x50,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "bvs" ,     ,     ,     ,     ,     ,     ,     ,     , 0x70,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "clc" ,     ,     ,     ,     ,     ,     ,     , 0x18,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "cld" ,     ,     ,     ,     ,     ,     ,     , 0xd8,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "cli" ,     ,     ,     ,     ,     ,     ,     , 0x58,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "clv" ,     ,     ,     ,     ,     ,     ,     , 0xb8,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "cmp" , 0xcd,     , 0xdd, 0xd9,     ,     , 0xc9,     ,     ,     ,     , 0xc5, 0xc1, 0xd5,     , 0xd2, 0xd1 ],
    [ "cpx" , 0xec,     ,     ,     ,     ,     , 0xe0,     ,     ,     ,     , 0xe4,     ,     ,     ,     ,      ],
    [ "cpy" , 0xcc,     ,     ,     ,     ,     , 0xc0,     ,     ,     ,     , 0xc4,     ,     ,     ,     ,      ],
    [ "dec" , 0xce,     , 0xde,     ,     , 0x3a,     ,     ,     ,     ,     , 0xc6,     , 0xd6,     ,     ,      ],
    [ "dex" ,     ,     ,     ,     ,     ,     ,     , 0xca,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "dey" ,     ,     ,     ,     ,     ,     ,     , 0x88,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "eor" , 0x4d,     , 0x5d, 0x59,     ,     , 0x49,     ,     ,     ,     , 0x45, 0x41, 0x55,     , 0x52, 0x51 ],
    [ "inc" , 0xee,     , 0xfe,     ,     , 0x1a,     ,     ,     ,     ,     , 0xe6,     , 0xf6,     ,     ,      ],
    [ "inx" ,     ,     ,     ,     ,     ,     ,     , 0xe8,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "iny" ,     ,     ,     ,     ,     ,     ,     , 0xc8,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "jmp" , 0x4c, 0x7c,     ,     , 0x6c,     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "jsr" , 0x20,     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "lda" , 0xad,     , 0xbd, 0xb9,     ,     , 0xa9,     ,     ,     ,     , 0xa5, 0xa1, 0xb5,     , 0xb2, 0xb1 ],
    [ "ldx" , 0xae,     ,     , 0xbe,     ,     , 0xa2,     ,     ,     ,     , 0xa6,     ,     , 0xb6,     ,      ],
    [ "ldy" , 0xac,     , 0xbc,     ,     ,     , 0xa0,     ,     ,     ,     , 0xa4,     , 0xb4,     ,     ,      ],
    [ "lsr" , 0x4e,     , 0x5e,     ,     , 0x4a,     ,     ,     ,     ,     , 0x46,     , 0x56,     ,     ,      ],
    [ "nop" ,     ,     ,     ,     ,     ,     ,     , 0xea,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "ora" , 0x0d,     , 0x1d, 0x19,     ,     , 0x09,     ,     ,     ,     , 0x05, 0x01, 0x15,     , 0x12, 0x11 ],
    [ "pha" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x48,     ,     ,     ,     ,     ,      ],
    [ "php" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x08,     ,     ,     ,     ,     ,      ],
    [ "phx" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0xda,     ,     ,     ,     ,     ,      ],
    [ "phy" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x5a,     ,     ,     ,     ,     ,      ],
    [ "pla" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x68,     ,     ,     ,     ,     ,      ],
    [ "plp" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x28,     ,     ,     ,     ,     ,      ],
    [ "plx" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0xfa,     ,     ,     ,     ,     ,      ],
    [ "ply" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x7a,     ,     ,     ,     ,     ,      ],
    [ "rmb0",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x07,     ,     ,     ,     ,      ],
    [ "rmb1",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x17,     ,     ,     ,     ,      ],
    [ "rmb2",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x27,     ,     ,     ,     ,      ],
    [ "rmb3",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x37,     ,     ,     ,     ,      ],
    [ "rmb4",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x47,     ,     ,     ,     ,      ],
    [ "rmb5",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x57,     ,     ,     ,     ,      ],
    [ "rmb6",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x67,     ,     ,     ,     ,      ],
    [ "rmb7",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x77,     ,     ,     ,     ,      ],
    [ "rol" , 0x2e,     , 0x3e,     ,     , 0x2a,     ,     ,     ,     ,     , 0x26,     , 0x36,     ,     ,      ],
    [ "ror" , 0x6e,     , 0x7e,     ,     , 0x6a,     ,     ,     ,     ,     , 0x66,     , 0x76,     ,     ,      ],
    [ "rti" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x40,     ,     ,     ,     ,     ,      ],
    [ "rts" ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x60,     ,     ,     ,     ,     ,      ],
    [ "sbc" , 0xed,     , 0xfd, 0xf9,     ,     , 0xe9,     ,     ,     ,     , 0xe5, 0xe1, 0xf5,     , 0xf2, 0xf1 ],
    [ "sec" ,     ,     ,     ,     ,     ,     ,     , 0x38,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "sed" ,     ,     ,     ,     ,     ,     ,     , 0xf8,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "sei" ,     ,     ,     ,     ,     ,     ,     , 0x78,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "smb0",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x87,     ,     ,     ,     ,      ],
    [ "smb1",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x97,     ,     ,     ,     ,      ],
    [ "smb2",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0xa7,     ,     ,     ,     ,      ],
    [ "smb3",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0xb7,     ,     ,     ,     ,      ],
    [ "smb4",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0xc7,     ,     ,     ,     ,      ],
    [ "smb5",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0xd7,     ,     ,     ,     ,      ],
    [ "smb6",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0xe7,     ,     ,     ,     ,      ],
    [ "smb7",     ,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0xf7,     ,     ,     ,     ,      ],
    [ "sta" , 0x8d,     , 0x9d, 0x99,     ,     ,     ,     ,     ,     ,     , 0x85, 0x81, 0x95,     , 0x92, 0x91 ],
    [ "stp" ,     ,     ,     ,     ,     ,     ,     , 0xdb,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "stx" , 0x8e,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x86,     ,     , 0x96,     ,      ],
    [ "sty" , 0x8c,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x84,     , 0x94,     ,     ,      ],
    [ "stz" , 0x9c,     , 0x9e,     ,     ,     ,     ,     ,     ,     ,     , 0x64,     , 0x74,     ,     ,      ],
    [ "tax" ,     ,     ,     ,     ,     ,     ,     , 0xaa,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "tay" ,     ,     ,     ,     ,     ,     ,     , 0xa8,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "trb" , 0x1c,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x14,     ,     ,     ,     ,      ],
    [ "tsb" , 0x0c,     ,     ,     ,     ,     ,     ,     ,     ,     ,     , 0x04,     ,     ,     ,     ,      ],
    [ "tsx" ,     ,     ,     ,     ,     ,     ,     , 0xba,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "txa" ,     ,     ,     ,     ,     ,     ,     , 0x8a,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "txs" ,     ,     ,     ,     ,     ,     ,     , 0x9a,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "tya" ,     ,     ,     ,     ,     ,     ,     , 0x98,     ,     ,     ,     ,     ,     ,     ,     ,      ],
    [ "wai" ,     ,     ,     ,     ,     ,     ,     , 0xcb,     ,     ,     ,     ,     ,     ,     ,     ,      ]
];


////////////////////////////////////////////
class Flags6502
{
    constructor() {
        this._n = false;
        this._v = false;
        this._b = false;
        this._d = false;
        this._i = false;
        this._z = false;
        this._c = false;
    }

    get n() { return this._n; };
    set n(val) { this._n = (val!=0); };
    get v() { return this._v; };
    set v(val) { this._v = (val!=0); };
    get b() { return this._b; };
    set b(val) { this._b = (val!=0); };
    get d() { return this._d; };
    set d(val) { this._d = (val!=0); };
    get i() { return this._i; };
    set i(val) { this._i = (val!=0); };
    get z() { return this._z; };
    set z(val) { this._z = (val!=0); };
    get c() { return this._c; };
    set c(val) { this._c = (val!=0); };

    get value() {
        return (this.n ? 0x80 : 0x00) |
               (this.v ? 0x40 : 0x00) |
                         0x20         |
               (this.b ? 0x10 : 0x00) |
               (this.d ? 0x08 : 0x00) |
               (this.i ? 0x04 : 0x00) |
               (this.z ? 0x02 : 0x00) |
               (this.c ? 0x01 : 0x00) ;
    }
    set value(val) {
        this.n = val & 0x80;
        this.v = val & 0x40;
        this.b = val & 0x10;
        this.d = val & 0x08;
        this.i = val & 0x04;
        this.z = val & 0x02;
        this.c = val & 0x01;
    }

    // addition overflow (av) occurs if:
    //   +a + +b = −r
    //   −a + −b = +r
    test_av(a, b, r) { this.v = ((a ^ r) & (b ^ r)) & 0x80; }
    // subtraction overflow (sv) occurs if:
    //   +a - -b = −r
    //   −a - +b = +r
    test_sv(a, b, r) { this.v = ((a ^ b) & (a ^ r)) & 0x80; }

    // carry calculation require the raw unclamped result
    test_c(val)     { this.c = (val & 0xf00); }

    test_n(val)     { this.n = (val & 0x80); }
    test_z(val)     { this.z = (val & 0xff) == 0; }

    reset() {
        this._n = false;
        this._v = false;
        this._b = false;
        this._d = false;
        this._i = false;
        this._z = false;
        this._c = false;
    }
}


////////////////////////////////////////////
class Register6502
{
    constructor() {
        this._a = 0;
        this._x = 0;
        this._y = 0;
        this._pc = 0;
        this._sp = 0xff;
        this._flags = new Flags6502();
    }
    get a() { return this._a; }
    set a(val) {
        this._a = (val & 0xff);
        this._flags.test_n(val);
        this._flags.test_z(val);
    }
    get x() { return this._x; }
    set x(val) {
        this._x = (val & 0xff);
        this._flags.test_n(val);
        this._flags.test_z(val);
    }
    get y() { return this._y; }
    set y(val) {
        this._y = (val & 0xff);
        this._flags.test_n(val);
        this._flags.test_z(val);
    }
    get pc() { return this._pc; }
    set pc(val) { this._pc = (val & 0xffff); }
    get sp() { return this._sp; }
    set sp(val) { this._sp = (val & 0xff); }
    get flag() { return this._flags; }

    reset() {
        this._a = 0;
        this._x = 0;
        this._y = 0;
        this._pc = 0;
        this._sp = 0xff;
        this._flags.reset();
    }
}


////////////////////////////////////////////
export class W65C02S
{
    constructor(memory) {
        this.mem = memory;
        this.reg = new Register6502();
        this.init();
    }

    get register() { return this.reg; }


    //                                            n v b d i z c
    // ADC   a + m + c -> a, c                    + + - - - + +
    //
    adc(memfn) {
        const m = memfn.read();
        const a = this.reg.a;
        let res = this.reg.flag.c ? 1 : 0;

        if(this.reg.flag.d) {  // bcd
            res += (a & 0x0f) + (m & 0x0f);
            if(res > 0x09) res += 0x06;
            res += (a & 0xf0) + (m & 0xf0);
            this.reg.flag.test_av(a, m, res);
            if(res > 0x99) res += 0x60;
        } else {
            res += a + m;
            this.reg.flag.test_av(a, m, res);
        }

        this.reg.a = res; // n & z tests are automatic
        this.reg.flag.test_c(res);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // AND   a & m -> a                           + - - - - + -
    //
    and(memfn) {
        this.reg.a &= memfn.read(); // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // ASL   c <- [76543210] <- 0                 + - - - - + +
    //
    asl(memfn) {
        const val = memfn.read();
        const res = val << 1;
        memfn.write(res);

        this.reg.flag.test_n(res);
        this.reg.flag.test_z(res);
        this.reg.flag.test_c(res);
        return memfn.cycles + memfn.write_extra_cycles;
    }

    //                                            n v b d i z c
    // BBRb   branch on bit b reset               - - - - - - -
    //
    bbr(b, memfn) {
        const val = memfn.read();
        if(!((val >> b) & 0x01)) {
            this.reg.pc = memfn.addr();
            return memfn.cycles + memfn.branch_extra_cycles;
        }
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // BBSb   branch on bit b set                 - - - - - - -
    //
    bbs(b, memfn) {
        const val = memfn.read();
        if((val >> b) & 0x01) {
            this.reg.pc = memfn.addr();
            return memfn.cycles + memfn.branch_extra_cycles;
        }
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // BCC   branch on carry clear (c = 0)        - - - - - - -
    //
    bcc(memfn) {
        if(!this.reg.flag.c) {
            this.reg.pc = memfn.addr();
            return memfn.cycles + memfn.branch_extra_cycles;
        }
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // BCS   branch on carry set (c = 1)          - - - - - - -
    //
    bcs(memfn) {
        if(this.reg.flag.c) {
            this.reg.pc = memfn.addr();
            return memfn.cycles + memfn.branch_extra_cycles;
        }
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // BEQ   branch on result zero (z = 1)        - - - - - - -
    //
    beq(memfn) {
        if(this.reg.flag.z) {
            this.reg.pc = memfn.addr();
            return memfn.cycles + memfn.branch_extra_cycles;
        }
        return memfn.cycles;
    }

    //                                            n  v  b d i z c
    // BIT   a & m -> z, m7 -> n, m6 -> v         m7 m6 - - - + -
    //
    bit(memfn, opnum) {
        const val = memfn.read();

        // a & m -> z
        this.reg.flag.test_z(val & this.reg.a);

        // immediate mode 0x89 does not set p7,6
        if(opnum != 0x89) {
            // m7 -> n
            this.reg.flag.n = (val & 0x80);
            // m6 -> v
            this.reg.flag.v = (val & 0x40);
        }

        return memfn.cycles;
    }

    //                                            n v b d i z c
    // BMI   branch on result minus (n = 1)       - - - - - - -
    //
    bmi(memfn) {
        if(this.reg.flag.n) {
            this.reg.pc = memfn.addr();
            return memfn.cycles + memfn.branch_extra_cycles;
        }
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // BNE   branch on result not zero (z = 0)    - - - - - - -
    //
    bne(memfn) {
        if(!this.reg.flag.z) {
            this.reg.pc = memfn.addr();
            return memfn.cycles + memfn.branch_extra_cycles;
        }
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // BPL   branch on result plus (n = 0)        - - - - - - -
    //
    bpl(memfn) {
        if(!this.reg.flag.n) {
            this.reg.pc = memfn.addr();
            return memfn.cycles + memfn.branch_extra_cycles;
        }
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // BRA   branch always                        - - - - - - -
    //
    bra(memfn) {
        this.reg.pc = memfn.addr();
        return memfn.cycles + memfn.branch_extra_cycles;
    }

    //                                            n v b d i z c
    // BRK   break                                - - 1 0 1 - -
    //
    brk(memfn) {
        this.reg.flag.b = true;
        this.reg.flag.d = false;
        this.reg.flag.i = true;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // BVC   branch on overflow clear (v = 0)     - - - - - - -
    //
    bvc(memfn) {
        if(!this.reg.flag.v) {
            this.reg.pc = memfn.addr();
            return memfn.cycles + memfn.branch_extra_cycles;
        }
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // BVS   branch on overflow set (v = 1)       - - - - - - -
    //
    bvs(memfn) {
        if(this.reg.flag.v) {
            this.reg.pc = memfn.addr();
            return memfn.cycles + memfn.branch_extra_cycles;
        }
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // CLC   c -> 0                               - - - - - - 0
    //
    clc(memfn) {
        this.reg.flag.c = false;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // CLD   d -> 0                               - - - 0 - - -
    //
    cld(memfn) {
        this.reg.flag.d = false;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // CLI   i -> 0                               - - - - 0 - -
    //
    cli(memfn) {
        this.reg.flag.i = false;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // CLV   v -> 0                               - 0 - - - - -
    //
    clv(memfn) {
        this.reg.flag.v = false;
        return memfn.cycles;
    }


    //                                            n v b d i z c
    // CMP   a-m                                  + - - - - + +
    //
    cmp(memfn) {
        const val = memfn.read();
        const res = (this.reg.a + (val ^ 0xff) + 1);

        this.reg.flag.test_n(res);
        this.reg.flag.test_z(res);
        this.reg.flag.test_c(res);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // CPX   x-m                                  + - - - - + +
    //
    cpx(memfn) {
        const val = memfn.read();
        const res = (this.reg.x + (val ^ 0xff) + 1);

        this.reg.flag.test_n(res);
        this.reg.flag.test_z(res);
        this.reg.flag.test_c(res);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // CPY   y-m                                  + - - - - + +
    //
    cpy(memfn) {
        const val = memfn.read();
        const res = (this.reg.y + (val ^ 0xff) + 1);

        this.reg.flag.test_n(res);
        this.reg.flag.test_z(res);
        this.reg.flag.test_c(res);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // DEC   m - 1 -> m                           + - - - - + -
    //
    dec(memfn) {
        const val = memfn.read();
        const res = val + 0xff;
        memfn.write(res);
        this.reg.flag.test_n(res);
        this.reg.flag.test_z(res);
        return memfn.cycles + memfn.write_extra_cycles;
    }

    //                                            n v b d i z c
    // DEX   x - 1 -> x                           + - - - - + -
    //
    dex(memfn) {
        this.reg.x += 0xff; // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // DEY   y - 1 -> y                           + - - - - + -
    //
    dey(memfn) {
        this.reg.y += 0xff; // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // EOR   a ^ m -> a                           + - - - - + -
    //
    eor(memfn) {
        this.reg.a ^= memfn.read(); // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // INC   m + 1 -> m                           + - - - - + -
    //
    inc(memfn) {
        const val = memfn.read();
        const res = val + 1;
        memfn.write(res);
        this.reg.flag.test_n(res);
        this.reg.flag.test_z(res);
        return memfn.cycles + memfn.write_extra_cycles;
    }

    //                                            n v b d i z c
    // INX   x + 1 -> x                           + - - - - + -
    //
    inx(memfn) {
        this.reg.x += 1; // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // INY   y + 1 -> y                           + - - - - + -
    //
    iny(memfn) {
        this.reg.y += 1; // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // JMP   m -> pc                              - - - - - - -
    //
    jmp(memfn) {
        this.reg.pc = memfn.addr();
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // JSR   push pc stack, m -> pc               - - - - - - -
    //
    jsr(memfn) {
        this.stack_push_word(this.reg.pc - 1);
        this.reg.pc = memfn.addr();
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // LDA   m -> a                               + - - - - + -
    //
    lda(memfn) {
        this.reg.a = memfn.read();  // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // LDX   m -> x                               + - - - - + -
    //
    ldx(memfn) {
        this.reg.x = memfn.read(); // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // LDY   m -> y                               + - - - - + -
    //
    ldy(memfn) {
        this.reg.y = memfn.read(); // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // LSR   0 -> [76543210] -> c                 + - - - - + +
    //
    lsr(memfn) {
        const val = memfn.read();
        const res = val >> 1;
        memfn.write(res);

        this.reg.flag.test_n(res);
        this.reg.flag.test_z(res);
        this.reg.flag.c = val & 0x01;
        return memfn.cycles + memfn.write_extra_cycles;
    }

    //                                            n v b d i z c
    // NOP   no operation                         - - - - - - -
    //
    nop(memfn) {
        ;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // ORA   a | m -> a                           + - - - - + -
    //
    ora(memfn) {
        this.reg.a |= memfn.read(); // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // PHA   a -> push stack                      - - - - - - -
    //
    pha(memfn) {
        this.stack_push_byte(this.reg.a);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // PHP   proc status -> push stack            - - - - - - -
    //
    php(memfn) {
        this.stack_push_byte(this.reg.flag.value);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // PHX   x -> push stack                      - - - - - - -
    //
    phx(memfn) {
        this.stack_push_byte(this.reg.x);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // PHY   y -> push stack                      - - - - - - -
    //
    phy(memfn) {
        this.stack_push_byte(this.reg.y);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // PLA   pull stack -> a                      + - - - - + -
    //
    pla(memfn) {
        this.reg.a = this.stack_pull_byte();
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // PLP   pull stack -> proc status             from stack
    //
    plp(memfn) {
        this.reg.flag.value = this.stack_pull_byte();
        this.reg.flag.b = false;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // PLX   pull stack -> x                      + - - - - + -
    //
    plx(memfn) {
        this.reg.x = this.stack_pull_byte();
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // PLY   pull stack -> y                      + - - - - + -
    //
    ply(memfn) {
        this.reg.y = this.stack_pull_byte();
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // RMB   reset memory bit b                   - - - - - - -
    //
    rmb(b, memfn) {
        const val = memfn.read();
        const res = val & (0xff ^ (1 << b));
        memfn.write(res);
        return memfn.cycles + memfn.write_extra_cycles;
    }

    //                                            n v b d i z c
    // ROL   c <- [76543210] <- c                 + - - - - + +
    //
    rol(memfn) {
        const val = memfn.read();
        const res = (val << 1) | (this.reg.flag.c ? 0x01 : 0x00);
        memfn.write(res);

        this.reg.flag.test_n(res);
        this.reg.flag.test_z(res);
        this.reg.flag.test_c(res);
        return memfn.cycles + memfn.write_extra_cycles;
    }

    //                                            n v b d i z c
    // ROR   c -> [76543210] -> c                 + - - - - + +
    //
    ror(memfn) {
        const val = memfn.read();
        const res = (val >> 1) | (this.reg.flag.c ? 0x80 : 0x00);
        memfn.write(res);

        this.reg.flag.test_n(res);
        this.reg.flag.test_z(res);
        this.reg.flag.c = val & 0x01;
        return memfn.cycles + memfn.write_extra_cycles;
    }

    //                                            n v b d i z c
    // RTI   pull stack -> sr, pull stack ->pc     from stack
    //
    rti(memfn) {
        this.reg.flag.value = this.stack_pull_byte();
        this.reg.flag.b = false;
        this.reg.pc = this.stack_pull_word();
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // RTS   pull stack -> pc                     - - - - - - -
    //
    rts(memfn) {
        this.reg.pc = this.stack_pull_word() + 1;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // SBC   a - m - c -> a                       + + - - - + +
    //
    sbc(memfn) {
        const m = memfn.read();
        const a = this.reg.a;
        let res = this.reg.flag.c ? 1 : 0;

        if(this.reg.flag.d) {  // bcd
            const mc = (m ^ 0xff);
            res += (a & 0x0f) + (mc & 0x0f);
            if(res < 0x10) res -= 0x06;
            res += (a & 0xf0) + (mc & 0xf0);
            this.reg.flag.test_sv(a, m, res);
            if(res < 0x100) res -= 0x60;
        } else {
            res += a + (m ^ 0xff);
            this.reg.flag.test_sv(a, m, res);
        }

        this.reg.a = res; // n & z tests are automatic
        this.reg.flag.test_c(res);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // SEC   1 -> c                               - - - - - - 1
    //
    sec(memfn) {
        this.reg.flag.c = true;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // SED   1 -> d                               - - - 1 - - -
    //
    sed(memfn) {
        this.reg.flag.d = true;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // SEI   1 -> i                               - - - - 1 - -
    //
    sei(memfn) {
        this.reg.flag.i = true;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // SMB   set memory bit b                     - - - - - - -
    //
    smb(b, memfn) {
        const val = memfn.read();
        const res = val | (1 << b);
        memfn.write(res);
        return memfn.cycles + memfn.write_extra_cycles;
    }

    //                                            n v b d i z c
    // STA   a -> m                               - - - - - - -
    //
    sta(memfn) {
        memfn.write(this.reg.a);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // STP   processor halt                       - - - - - - -
    //
    stp(memfn) {
        return memfn.cycles;// TODO: return -1?
    }

    //                                            n v b d i z c
    // STX   x -> m                               - - - - - - -
    //
    stx(memfn) {
        memfn.write(this.reg.x);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // STY   y -> m                               - - - - - - -
    //
    sty(memfn) {
        memfn.write(this.reg.y);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // STZ   0 -> m                               - - - - - - -
    //
    stz(memfn) {
        memfn.write(0x00);
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // TAX   a -> x                               + - - - - + -
    //
    tax(memfn) {
        this.reg.x = this.reg.a; // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // TAY   a -> y                               + - - - - + -
    //
    tay(memfn) {
        this.reg.y = this.reg.a; // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // TRB   m & a -> z, m & ~a -> m              - - - - - + -
    //
    trb(memfn) {
        const val = memfn.read();
        memfn.write(val & ~this.reg.a);
        this.reg.flag.test_z(val & this.reg.a);
        return memfn.cycles + memfn.write_extra_cycles;
    }

    //                                            n v b d i z c
    // TSB   m & a -> z, m | a -> m               - - - - - + -
    //
    tsb(memfn) {
        const val = memfn.read();
        memfn.write(val | this.reg.a);
        this.reg.flag.test_z(val & this.reg.a);
        return memfn.cycles + memfn.write_extra_cycles;
    }

    //                                            n v b d i z c
    // TSX   sp -> x                              + - - - - + -
    //
    tsx(memfn) {
        this.reg.x = this.reg.sp; // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // TXA   x -> a                               + - - - - + -
    //
    txa(memfn) {
        this.reg.a = this.reg.x; // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // TXS   x -> sp                              - - - - - - -
    //
    txs(memfn) {
        this.reg.sp = this.reg.x;
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // TYA   y -> a                               + - - - - + -
    //
    tya(memfn) {
        this.reg.a = this.reg.y; // n & z tests are automatic
        return memfn.cycles;
    }

    //                                            n v b d i z c
    // WAI   wait for interrupt                   - - 1 - - - -
    //
    wai(memfn) {
        this.reg.flag.b = true;
        return memfn.cycles;
    }


    // step one instruction
    // returns cycles used for the operation
    step() {
        const opcode = this.mem.read(this.reg.pc++);
        const opfcn = this.op[opcode];
        if(!opfcn) {
            console.log("!!!! illegal opcode: 0x" + opcode.toString(16).padStart(2, '0') + "  pc: 0x" + (this.reg.pc-1).toString(16).padStart(4, '0'));
            return -1;  // TODO: ensure all 256 positions are covered
        }
        return opfcn();
    }

    stack_push_byte(val) {
        // stack is located at 0x0100
        this.mem.write(0x0100 | this.reg.sp--, val); // push down --
    }
    stack_push_word(val) {
        this.stack_push_byte(val >> 8);
        this.stack_push_byte(val & 0xff);
    }

    stack_pull_byte() {
        // stack is located at 0x0100
        return this.mem.read(0x0100 | ++this.reg.sp); // pull up ++
    }
    stack_pull_word() {
        return this.stack_pull_byte() | this.stack_pull_byte()<<8;
    }


    init() {
        // addressing modes, pp.15-20
        //     1: absolute                 a       Absolute
        //     2: absolute_x_indirect      (a,x)   Absolute Indexed Indirect
        //     3: absolute_x               a,x     Absolute Indexed with X
        //     4: absolute_y               a,y     Absolute Indexed with Y
        //     5: absolute_indirect        (a)     Absolute Indirect
        //     6: accumulator              A       Accumulator
        //     7: immediate                #       Immediate Addressing
        //     8: implied                  i       Implied
        //    9a: relative_pc              r       Program Counter Relative
        //    9b: zero_page_relative_pc    zp,r    Zero Page Program Counter Relative
        //    10: relative_stack           s       Stack
        //    11: zero_page                zp      Zero Page
        //    12: zero_page_x_indirect     (zp,x)  Zero Page Indexed Indirect
        //    13: zero_page_x              zp,x    Zero Page Indexed with X
        //    14: zero_page_y              zp,y    Zero Page Indexed with Y
        //    15: zero_page_indirect       (zp)    Zero Page Indirect
        //    16: zero_page_indirect_y     (zp),y  Zero Page Indirect Indexed with Y
        const pop_byte_pc = () => { return this.mem.read(this.reg.pc++); };
        const pop_word_pc = () => { return pop_byte_pc() | pop_byte_pc()<<8; };

        const addr_mode = [
            // 1. Absolute  a
            ((addr) => { return {
                name: "absolute",
                init: () => { addr = pop_word_pc(); },
                addr: () => { return addr; },
                read: () => { return this.mem.read(addr); },
                write: (val) => { this.mem.write(addr, val); },
                bytes: 3,
                cycles: 4,
                write_extra_cycles: 2
            } })(),

            // 2. Absolute Indexed Indirect  (a,x)  (used for jmp)
            ((addr) => { return {
                name: "absolute_x_indirect",
                init: () => { addr = this.mem.read_word((pop_word_pc() + this.reg.x) & 0xffff); },
                addr: () => { return addr; },
                //read: () => { return this.mem.read(addr); },
                //write: (val) => { this.mem.write(addr, val); },
                bytes: 3,
                cycles: 5,
                write_extra_cycles: 0
            } })(),

            // 3. Absolute Indexed with X  a,x
            ((addr) => { return {
                name: "absolute_x",
                init: () => { addr = (pop_word_pc() + this.reg.x) & 0xffff; },
                addr: () => { return addr; },
                read: () => { return this.mem.read(addr); },
                write: (val) => { this.mem.write(addr, val); },
                bytes: 3,
                cycles: 4,
                write_extra_cycles: 2
                // TODO: +1 cycle for page boundary
            } })(),

            // 4. Absolute Indexed with Y  a,y
            ((addr) => { return {
                name: "absolute_y",
                init: () => { addr = (pop_word_pc() + this.reg.y) & 0xffff; },
                addr: () => { return addr; },
                read: () => { return this.mem.read(addr); },
                write: (val) => { this.mem.write(addr, val); },
                bytes: 3,
                cycles: 4,
                write_extra_cycles: 0
                // TODO: +1 cycle for page boundary
            } })(),

            // 5. Absolute Indirect  (a)   (used for jmp)
            ((addr) => { return {
                name: "absolute_indirect",
                init: () => { addr = this.mem.read_word(pop_word_pc()); },
                addr: () => { return addr; },
                //read: () => { return this.mem.read(addr); },
                //write: (val) => { this.mem.write(addr, val); },
                bytes: 3,
                cycles: 4,
                write_extra_cycles: 2
            } })(),

            // 6. Accumulator  A
            ((addr) => { return {
                name: "accumulator",
                init: () => { },
                read: () => { return this.reg.a; },
                write: (val) => { this.reg.a = val; },
                bytes: 1,
                cycles: 2,
                write_extra_cycles: 0
            } })(),

            // 7. Immediate  #
            ((addr) => { return {
                name: "immediate",
                init: () => { },
                read: () => { return pop_byte_pc(); },
                bytes: 2,
                cycles: 2,
                write_extra_cycles: 0
            } })(),

            // 8. Implied  i
            ((addr) => { return {
                name: "implied",
                init: () => { },
                bytes: 1,
                cycles: 2,
                write_extra_cycles: 0
            } })(),

            // 9a. Program Counter Relative  r
            ((offs) => { return {
                name: "relative_pc",
                init: () => { offs = pop_byte_pc(); },
                addr: () => { return (this.reg.pc + ((offs & 0x80) ? (offs | 0xff00) : offs)) & 0xffff; },
                bytes: 2,
                cycles: 2,
                branch_extra_cycles: 1
            } })(),

            // 9b. Zero Page Program Counter Relative  zp,r
            //     note: not explicity described in the w65c02s datasheet
            //       but applies to BBRb zp,offs and BBSb zp,offs operations
            //       BBRb and BBSb are three byte operations
            ((addr, offs) => { return {
                name: "zero_page_relative_pc",
                init: () => { addr = pop_byte_pc(); offs = pop_byte_pc(); },
                read: () => { return this.mem.read(addr); },
                addr: () => { return (this.reg.pc + ((offs & 0x80) ? (offs | 0xff00) : offs)) & 0xffff; },
                bytes: 3,
                cycles: 2,
                branch_extra_cycles: 1
            } })(),

            // 10. Stack  s
            ((addr) => { return {
                name: "relative_stack",
                init: () => { },
                bytes: 1,  // TODO: up to +3 stack bytes
                cycles: 3,
                write_extra_cycles: 0
                // TODO: +4 cycles possible
            } })(),

            // 11. Zero Page  zp
            ((addr) => { return {
                name: "zero_page",
                init: () => { addr = pop_byte_pc(); },
                addr: () => { return addr; },
                read: () => { return this.mem.read(addr); },
                write: (val) => { this.mem.write(addr, val); },
                bytes: 2,
                cycles: 3,
                write_extra_cycles: 2
            } })(),

            // 12. Zero Page Indexed Indirect  (zp,x)
            ((addr) => { return {
                name: "zero_page_x_indirect",
                init: () => { addr = this.mem.read_word((pop_byte_pc() + this.reg.x) & 0xff); },
                addr: () => { return addr; },
                read: () => { return this.mem.read(addr); },
                write: (val) => { this.mem.write(addr, val); },
                bytes: 2,
                cycles: 6,
                write_extra_cycles: 0
            } })(),

            // 13. Zero Page Indexed with X  zp,x
            ((addr) => { return {
                name: "zero_page_x",
                init: () => { addr = (pop_byte_pc() + this.reg.x) & 0xff; },
                addr: () => { return addr; },
                read: () => { return this.mem.read(addr); },
                write: (val) => { this.mem.write(addr, val); },
                bytes: 2,
                cycles: 4,
                write_extra_cycles: 2
            } })(),

            // 14. Zero Page Indexed with Y  zp,y
            ((addr) => { return {
                name: "zero_page_y",
                init: () => { addr = (pop_byte_pc() + this.reg.y) & 0xff; },
                addr: () => { return addr; },
                read: () => { return this.mem.read(addr); },
                write: (val) => { this.mem.write(addr, val); },
                bytes: 2,
                cycles: 4,
                write_extra_cycles: 0
            } })(),

            // 15. Zero Page Indirect  (zp)
            ((addr) => { return {
                name: "zero_page_indirect",
                init: () => { addr = this.mem.read_word(pop_byte_pc()); },
                addr: () => { return addr; },
                read: () => { return this.mem.read(addr); },
                write: (val) => { this.mem.write(addr, val); },
                bytes: 2,
                cycles: 5,
                write_extra_cycles: 0
            } })(),

            // 16. Zero Page Indirect Indexed with Y  (zp),y
            ((addr) => { return {
                name: "zero_page_indirect_y",
                init: () => { addr = (this.mem.read_word(pop_byte_pc()) + this.reg.y) & 0xffff; },
                addr: () => { return addr; },
                read: () => { return this.mem.read(addr); },
                write: (val) => { this.mem.write(addr, val); },
                bytes: 2,
                cycles: 5,
                write_extra_cycles: 0
            } })()
        ];


        // build the opcode lookup table
        this.op = [ ];
        for(let i=0; i<opdef.length; i++) {
            const opentry = opdef[i];        // the whole line: [ "adc" , 0x6d...
            const opname = opentry[0];       // the name: "adc"
            for(let j=0; j<18; j++) {        // enum address modes for the entry
                const opnum = opentry[j+1];  // op num for addr mode: 0x6d
                if(opnum != undefined) {     // op supports this address mode?
                    if(this.op[opnum]) throw new Error("opcode 0x"+opnum.toString(16).padStart(2, '0')+" already in use");
                    const memfn = addr_mode[j];
                    if(opname.length > 3) {
                        // digit 4 is the bit num
                        const fp = this[opname.substr(0, 3)];
                        const b = parseInt(opname[3]);
                        this.op[opnum] = () => {
                            memfn.init();
                            return fp.call(this, b, memfn, opnum);
                        };
                    } else {
                        const fp = this[opname];
                        this.op[opnum] = () => {
                            memfn.init();
                            return fp.call(this, memfn, opnum);
                        };
                    }
                }
            }
        }

        // illegal opcodes (nop)
        this.op[0x02] = () => { this.reg.pc++; return 2; };
        this.op[0x22] = () => { this.reg.pc++; return 2; };
        this.op[0x42] = () => { this.reg.pc++; return 2; };
        this.op[0x62] = () => { this.reg.pc++; return 2; };
        this.op[0x82] = () => { this.reg.pc++; return 2; };
        this.op[0xc2] = () => { this.reg.pc++; return 2; };
        this.op[0xe2] = () => { this.reg.pc++; return 2; };
        this.op[0x44] = () => { this.reg.pc++; return 3; };
        this.op[0x54] = () => { this.reg.pc++; return 4; };
        this.op[0xd4] = () => { this.reg.pc++; return 4; };
        this.op[0xf4] = () => { this.reg.pc++; return 4; };
        this.op[0xdc] = () => { this.reg.pc+=2; return 4; };
        this.op[0xfc] = () => { this.reg.pc+=2; return 4; };
        this.op[0x5c] = () => { this.reg.pc+=2; return 8; };
    }

    reset() {
        //this.mem.reset();
        this.reg.reset();
    }

}
