const BASE = `
*{box-sizing:border-box}
body{margin:0;line-height:1.5}
header,main,footer{max-width:42rem;margin:0 auto;padding:1.5rem}
h1{font-size:1.75rem;font-weight:600;margin:2rem 0 .5rem}
h2{font-size:1rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:3rem 0 1rem}
.thesis{margin:0 0 2rem}
.specimen{margin:0 0 3rem}
video{display:block;width:100%;max-height:75vh;background:#000}
.placard{margin:.75rem 0 0}
.date{margin:.25rem 0 0;font-size:.875rem}
footer{font-size:.875rem;padding-bottom:4rem}
`;

const ARRANGED = `
.arr-wall main,.arr-corridor main,.arr-dial main{max-width:none;padding:0}
.arr-wall header,.arr-corridor header,.arr-dial header{max-width:60rem}
.sound{display:none}
.needs-sound .sound{display:block;position:absolute;right:6px;bottom:6px;font:11px system-ui,sans-serif;color:#fff;background:#000a;border:0;border-radius:99px;padding:3px 8px;pointer-events:none}
.arr-wall .specimen,.arr-corridor .specimen,.arr-dial .specimen{position:relative;margin:0;background:#000}
.arr-wall figcaption,.arr-dial figcaption{position:absolute;left:0;right:0;top:0;padding:6px 8px;color:#fff;font:12px/1.35 system-ui,sans-serif;background:linear-gradient(#000c,#0000);opacity:0;transition:opacity .25s;pointer-events:none}
.arr-wall .focus figcaption,.arr-dial .focus figcaption{opacity:1}
.arr-wall .placard,.arr-dial .placard,.arr-corridor .placard{margin:0}
.arr-wall .date,.arr-dial .date,.arr-corridor .date{color:#ddd}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:2px;padding:2px}
.grid .specimen{aspect-ratio:9/16;transition:transform .3s}
.grid video{width:100%;height:100%;max-height:none;object-fit:cover}
.grid .focus{transform:scale(2.4);z-index:5;box-shadow:0 20px 60px #000}
.corridor .stick{display:flex;overflow-x:auto;padding:2rem 0}
.js .corridor .stick{position:sticky;top:0;height:100vh;overflow:hidden;display:block;padding:0}
.corridor .track{display:flex;align-items:center;gap:7vw;padding:0 12vw;height:100%;will-change:transform}
.corridor .specimen{flex:none;margin:0 0 1.8rem}
.corridor video{width:auto;max-width:none;max-height:none;height:62vh}
.corridor .specimen[data-n="1"] video{height:78vh}
.corridor .specimen[data-n="2"] video{height:48vh}
.corridor .specimen[data-n="3"] video{height:70vh}
.corridor .specimen[data-n="4"] video{height:54vh}
.corridor figcaption{position:absolute;left:0;top:100%;padding-top:.4rem;white-space:nowrap;font-size:.8rem}
.dial{display:grid;place-items:center;padding:3rem 0}
.ring{position:relative;width:min(78vh,92vw);aspect-ratio:1;border:1px solid #8884;border-radius:50%}
.ring::before{content:"";position:absolute;inset:18%;border:1px dashed #8883;border-radius:50%}
.tick{position:absolute;transform:translate(-50%,-50%);font:11px system-ui,sans-serif;opacity:.5}
.hub{position:absolute;inset:0;display:grid;place-items:center;text-align:center;margin:0;opacity:.5;font-size:.8rem;pointer-events:none}
.dial .specimen{position:absolute;width:11%;aspect-ratio:9/16;transform:translate(-50%,-50%);transition:transform .35s}
.dial video{width:100%;height:100%;max-height:none;object-fit:cover}
.dial .focus{transform:translate(-50%,-50%) scale(3);z-index:9}
`;

export const THEMES: Record<string, string> = {
  gallery: BASE + ARRANGED + `body{background:#f7f6f2;color:#1b1b1b;font-family:Georgia,'Times New Roman',serif}
.thesis,footer,.date{color:#555}`,
  nocturne: BASE + ARRANGED +
    `body{background:#111;color:#e6e6e6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.thesis,footer,.date{color:#9a9a9a}`,
};
