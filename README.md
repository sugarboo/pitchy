# Pitchy

Pitchy 是一个完全在浏览器本地运行的实时练声 PWA。项目当前处于 `v0.1 / M1`：已建立工程、质量检查、PWA 清单、响应式欢迎页、浏览器能力检测、暗色 / 亮色主题切换与中英切换，并已接入麦克风权限、AudioContext 生命周期和 AudioWorklet PCM 分帧。

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
- 当前页面只会在用户明确点击后请求麦克风权限并创建或恢复 AudioContext；支持暂停、恢复和停止，停止或卸载时会断开输入节点、关闭上下文并停止全部轨道。
- 暂停期间本次练习仍持有麦克风轨道；停止后才会完全释放。页面隐藏时会暂停已运行的会话或取消尚未完成的启动，恢复可见后不会自行恢复音频。
- AudioWorklet 会将输入声道下混为单声道，并按 4096 samples / 2048 samples hop 生成可转移的 `Float32Array` 帧；音频图以零增益连接到输出，麦克风声音不会回放。
- Dedicated Worker 已接收可转移 PCM 帧并计算去直流的 AC RMS / 近似 dBFS，只把不含 PCM 的小型结果返回主线程；YIN、voiced 判定和实时电平 UI 尚未接入，原始帧不会进入 React state、持久化或上传。
- 页面中的实时读数是明确标注的界面预览，不代表已开始音高分析。
- 本产品不用于医疗诊断，也不能替代声乐老师或专业检查。

项目约束与完整路线图见 [AGENTS.md](AGENTS.md)。跨设备 Codex 接续入口位于 `.agents/skills/pitchy-router/SKILL.md`。
