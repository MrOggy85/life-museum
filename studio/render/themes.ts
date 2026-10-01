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

export const THEMES: Record<string, string> = {
  gallery: BASE + `body{background:#f7f6f2;color:#1b1b1b;font-family:Georgia,'Times New Roman',serif}
.thesis,footer,.date{color:#555}`,
  nocturne: BASE + `body{background:#111;color:#e6e6e6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.thesis,footer,.date{color:#9a9a9a}`,
};
