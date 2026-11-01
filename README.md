# KillQuestion

本地优先的题库刷题应用。**重点刷题**和**大范围刷题**两条主线，填空 / 单选 / 多选 / 简答 / 论述五种题型都能刷，数据只存在你自己的浏览器里，断网也能用。

在线版：<https://zmfk.github.io/KillQuestion/>

---

## 重要：仓库里没有题库

这个仓库**只放程序，不放任何题目内容**。

题目属于原始资料的版权方（复习手册与划重点页），不适合随代码公开分发，所以：

- 题库不打包进构建产物，`dist/` 里一行题目都没有；
- 第一次打开应用时会要求你**选择一个题库 JSON 文件**导入；
- 导入后题库保存在本机浏览器（`localStorage`），不上传任何服务器。

题库文件叫什么随意，结构见下文「题库格式」。如果你是从项目作者那里拿到的，文件名一般是 `KillQuestion-题库.json`。

换浏览器、换设备、清缓存都需要重新导入一次，学习记录也会一起丢，请注意。

---

## 两种用法

### 1. 在线版（推荐）

打开 <https://zmfk.github.io/KillQuestion/> → 导入题库 → 开始刷。

手机上还可以「添加到主屏幕 / 安装应用」，装完就是个离线 App。

### 2. 本地版（自带服务，不联网也能开）

需要 Node.js 18+。双击根目录的 **`启动.cmd`**：它会自动找 Node、缺依赖就装、没构建就先构建、然后起本地服务并打开浏览器。关掉那个黑窗口就停止服务。

不想装环境就直接用在线版，功能完全一样。

---

## 刷题方式

| 入口 | 说明 |
| --- | --- |
| **重点刷题** | 只刷被划重点覆盖的题，考前冲刺 |
| **大范围刷题** | 全库随机，不留死角 |
| **顺序通刷** | 按原书顺序（填空→选择→简答→论述）从头过 |
| **模拟考试** | 按真实卷面配比组卷，60 分钟倒计时，到点自动交卷 |
| **错题重刷** | 只抽「错得比对得多」的题 |
| **收藏夹** | 做题时点星标收起来 |
| **按考点刷** | 划重点页拆成的考点，一个一个打 |

判分规则：

- **单选 / 多选**：按选项集合比对，多选漏选算错；
- **填空**：全角半角、空白、标点、大小写一律归一化后逐空比对，少一个空算错；
- **简答 / 论述**：没有标准答案可自动判，显示参考答案后由你自己点「答上来了 / 没答上来」，同样计入错题。

---

## 题库格式

```jsonc
{
  "version": 1,
  "meta": { "title": "题库名", "total": 1, "counters": {}, "keyTotal": 1 },
  "topics": [
    { "id": "k01", "section": "一、党章与党的基本理论", "title": "党的根本宗旨", "count": 2 }
  ],
  "questions": [
    {
      "id": "Q0070",
      "type": "fill",              // single | multi | fill | short | essay
      "no": 70,
      "section": "fill",
      "sectionLabel": "填空题",
      "stem": "中国共产党的根本宗旨是（）。",
      "answer": ["全心全意为人民服务"],
      "answerText": "全心全意为人民服务",
      "blanks": 1,
      "topicIds": ["k01"]          // 属于哪些考点，可为空数组
    },
    {
      "id": "Q0174",
      "type": "single",
      "stem": "……",
      "options": [{ "key": "A", "text": "……" }],
      "answer": ["A"],
      "topicIds": []
    }
  ]
}
```

导入时会校验：`id` 唯一、`type` 合法、`stem` 非空。结构不对会直接报错，不会写半截数据。

---

## 开发

```bash
npm install
npm run dev        # 开发服务器
npm run typecheck  # 类型检查
npm test           # 单元测试
npm run build      # 生产构建（产物在 dist/）
```

部署：推送到 `main` 后 `.github/workflows/pages.yml` 会跑测试、构建并发布到 GitHub Pages。构建用 `base: './'` + `HashRouter`，所以子路径下刷新不会 404。

### 从原始 PDF 重建题库（可选）

仓库里不带 PDF，也不带题库，这一步只在你自己有原始资料时才有意义：

```bash
python scripts/parse_bank.py        # input/bank_raw.txt  → data/bank.json
python scripts/match_keypoints.py   # 匹配考点           → data/bank_tagged.json
python scripts/build_app_data.py    #                    → KillQuestion-题库.json
```

`input/`（PDF 与提取的纯文本）和 `data/`（中间产物）都在 `.gitignore` 里，不会进仓库。

### 目录

```
src/
├─ core/       纯函数：洗牌、随机源、判分（零 UI、零存储依赖）
├─ data/       题库索引与导入校验
├─ store/      zustand：题库、会话、进度（localStorage 持久化）
├─ components/ 布局、导入面板
└─ pages/      首页 / 考点 / 答题 / 结算 / 题库
```

---

## 来龙去脉

- 起点是 [错笺 CuoJian](https://github.com/wei238982377/cuojian)（MIT）：本地优先、无账号、无统计的思路，纯函数内核、测试与 Pages 工作流都继承自它。
- 业务层按「整库刷题」重写：加入题库导入、五种题型、重点/全量双模式、考点维度、模拟考试。
- 题库解析与考点标注脚本见 `scripts/`，从复习手册 PDF 与本机划重点页生成。

MIT 许可，见 [LICENSE](LICENSE)。改动可以随意用，保留原项目链接即可。
