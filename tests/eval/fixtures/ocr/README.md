# OCR_RECOGNIZE Eval Fixtures

Sprint 16 US-058 建立的素材槽。EvalRunner 通过
`tests/eval/datasets/ocr-recognize.json` 读取此目录下的图片。

## 当前状态

**合成图 smoke test**：两张由 `scripts/gen-ocr-fixtures.ts` 生成的机打图片
（SVG → JPG，白底黑字、零噪声），仅用于验证 OCR 管道能跑通：

- `math-g2-01.jpg` — 二年级进位加法 3 题（第 1 题答错）
- `chinese-g3-01.jpg` — 三年级成语填空 3 题

**这些不是生产质量基线**。真实场景（手写 + 扫描噪声 + 拍照角度）
的 OCR 退化不会被合成图捕获。当提供真实 K-12 扫描/拍照题图后，
替换或追加 case，并把 dataset 中的 `note: "synthetic..."` 去掉。

重新生成合成图：`npx tsx scripts/gen-ocr-fixtures.ts`

## 素材规格

| 项 | 要求 |
|---|---|
| 数量 | 2-4 张，覆盖数学 / 中文 / 英语 |
| 尺寸 | < 100 KB / 张（长边压到 ≤ 1024 px） |
| 格式 | JPG 或 PNG |
| 内容 | 真实 K-12 作业/练习题扫描，题干 + 学生答案清晰可辨 |
| 文件名 | `<subject>-<grade>-<seq>.jpg`，如 `math-g2-01.jpg` |

## 补齐流程

1. 把图片放入本目录（`tests/eval/fixtures/ocr/`）
2. 上传到 MinIO（dev 环境）并记下 key，或使用本地绝对路径（仅离线测试）
3. 编辑 `tests/eval/datasets/ocr-recognize.json`：
   - 删掉 `unavailableReason` 字段
   - 添加 `cases[]`，每条：
     ```json
     {
       "id": "ocr-math-g2-01",
       "input": { "imageUrls": ["minio://<bucket>/<key>"], "hasExif": false },
       "expected": {
         "subject": "MATH",
         "questions": [
           {
             "questionNumber": 1,
             "questionType": "CALCULATION",
             "content": "48 + 37 = ?",
             "studentAnswer": "75"
           }
         ]
       },
       "locale": "zh-CN"
     }
     ```
4. 重跑 Admin `/admin/eval` → Run All

## 评估维度

OCR 评估主要依赖 `judgedFields: ["questions"]`（由 EVAL_JUDGE 对识别结果的
文字内容 + 题型判断打分），不走 exactMatch（OCR 的 confidence / 坐标
无法精确对齐）。
