# Pitchy

Pitchy 是一个完全在浏览器本地运行的实时练声 PWA。项目当前处于 `v0.1 / M1`：已建立工程、质量检查、PWA 清单、响应式欢迎页、浏览器能力检测、暗色 / 亮色主题切换与中英切换，并正在接入麦克风权限和音频线程。

## 本地开发

要求 Node.js `>=24` 与 `pnpm 11.9.0`。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

完整验收：

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
pnpm test:e2e
pnpm check:size
```

首次运行浏览器测试前，可能需要执行：

```bash
pnpm exec playwright install chromium
```

## 当前边界

- 生产运行时无后端、无机器学习、无第三方分析或字体 CDN。
- 原始 PCM 和录音默认不保存、不上传。
- 主题和语言偏好使用带命名空间的本地设置保存，不发送到网络。
- 当前页面只会在用户明确点击后请求麦克风权限，并立即停止权限探测取得的轨道；尚未创建 AudioContext，也不处理或保存音频。
- 页面中的实时读数是明确标注的界面预览，不代表已开始音高分析。
- 本产品不用于医疗诊断，也不能替代声乐老师或专业检查。

项目约束与完整路线图见 [AGENTS.md](AGENTS.md)。跨设备 Codex 接续入口位于 `.agents/skills/pitchy-router/SKILL.md`。
