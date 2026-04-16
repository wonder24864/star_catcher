/**
 * Generate synthetic OCR fixture images for EvalFramework smoke tests.
 *
 * Sprint 16 US-058. Output:
 *   tests/eval/fixtures/ocr/math-g2-01.jpg   (two-digit add/sub with carry)
 *   tests/eval/fixtures/ocr/chinese-g3-01.jpg (fill-in-the-blank with idiom)
 *
 * IMPORTANT: These are SYNTHETIC machine-rendered images — clean white bg,
 * printed typeface, no noise. They verify the OCR pipeline wiring (input
 * → recognize-homework → structured output) but do NOT constitute a
 * production quality baseline. Real K-12 scanned/photographed homework
 * fixtures must replace these for the 80% pass-rate baseline to be
 * meaningful.
 *
 * Run: npx tsx scripts/gen-ocr-fixtures.ts
 */
import sharp from "sharp";
import path from "node:path";
import { mkdirSync } from "node:fs";

const OUT_DIR = path.resolve(process.cwd(), "tests/eval/fixtures/ocr");

interface Fixture {
  filename: string;
  svg: string;
}

const FIXTURES: Fixture[] = [
  {
    filename: "math-g2-01.jpg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <style>
    .title { font-family: sans-serif; font-size: 22px; font-weight: bold; fill: #222; }
    .q { font-family: sans-serif; font-size: 26px; fill: #111; }
    .ans { font-family: 'Kaiti','楷体',sans-serif; font-size: 28px; fill: #0b4d8f; }
    .tag { font-family: sans-serif; font-size: 16px; fill: #666; }
  </style>
  <text x="30" y="50" class="title">二年级数学作业 · 进位加法</text>
  <text x="30" y="90" class="tag">姓名：小明      日期：2026-04-15</text>

  <text x="40" y="150" class="q">1.  28 + 35 =</text>
  <text x="220" y="150" class="ans">53</text>

  <text x="40" y="210" class="q">2.  47 + 18 =</text>
  <text x="220" y="210" class="ans">65</text>

  <text x="40" y="270" class="q">3.  36 + 29 =</text>
  <text x="220" y="270" class="ans">65</text>

  <text x="30" y="360" class="tag">（第 1 题答错，学生误算为 53，正确答案 63；第 2、3 题正确）</text>
</svg>`,
  },
  {
    filename: "chinese-g3-01.jpg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="420" viewBox="0 0 680 420">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <style>
    .title { font-family: 'Kaiti','楷体',sans-serif; font-size: 22px; font-weight: bold; fill: #222; }
    .q { font-family: 'Kaiti','楷体',sans-serif; font-size: 24px; fill: #111; }
    .ans { font-family: 'Kaiti','楷体',sans-serif; font-size: 26px; fill: #0b4d8f; }
    .tag { font-family: sans-serif; font-size: 16px; fill: #666; }
  </style>
  <text x="30" y="50" class="title">三年级语文作业 · 成语填空</text>
  <text x="30" y="90" class="tag">姓名：小红      日期：2026-04-15</text>

  <text x="40" y="150" class="q">1. 请用"迫不及待"造句：</text>
  <text x="60" y="190" class="ans">他迫不及待地打开了礼物盒。</text>

  <text x="40" y="250" class="q">2. 填空：画蛇__足。</text>
  <text x="260" y="250" class="ans">添</text>

  <text x="40" y="310" class="q">3. 解释"亡羊补牢"的意思：</text>
  <text x="60" y="350" class="ans">羊丢了再修羊圈，比喻出了问题后及时补救。</text>
</svg>`,
  },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const f of FIXTURES) {
    const outPath = path.join(OUT_DIR, f.filename);
    await sharp(Buffer.from(f.svg))
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(outPath);
    console.log(`✓ wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
