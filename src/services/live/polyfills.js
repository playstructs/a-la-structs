// The cosmjs stack expects Node's Buffer and `global`; the webapp got them from webpack.
import { Buffer } from 'buffer';
if (!globalThis.Buffer) globalThis.Buffer = Buffer;
if (!globalThis.global) globalThis.global = globalThis;
