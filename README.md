# Interview Coder（开源魔改版）

这是一个面向技术面试的桌面助手，提供截图解析、AI 解题与调试、隐身窗口等功能。应用完全本地运行，需自备 OpenAI、Google Gemini 或 Anthropic 等模型的 API Key，私有数据仅在你与模型供应商之间传输。
官网：  in.abruzz1.cn

## 功能概览
- 截图队列：使用全局快捷键随时捕获题面或代码，最多保留 5 张，队列内可删除与重新截图。
- AI 解析与作答：自动读取截图，生成题目理解、思考过程与最终回答。若检测到代码需求会输出可复制代码块并附复杂度说明；识别到选择题会给出明确 ABCD 选项及理由。
- 结果调试：Solutions 页面可一键进入 Debug 模式，将错误截图交给模型输出修复建议、关键问题和优化方向。
- 窗口隐身：Electron 浮窗默认透明，支持位置、透明度、尺寸调节，降低被屏幕共享或录制捕捉的风险。
- 多模型支持：内置 GPT‑5、Gemini 2.5、Claude 4 等模型配置，可按需切换或扩展。（推荐使用gemini2.5flash）

## 运行要求
- Windows 10/11（推荐），macOS 13 及以上可使用同目录下的启动脚本
- Node.js 18 或更新版本
- 首次运行需执行 npm install 安装依赖
- 可用的 API Key（在应用内的设置弹窗中粘贴）

## 快速启动（Windows）
1. 安装依赖：

       npm install

2. 启动隐身版应用：

       stealth-run.bat

   脚本会自动清理旧构建、重新打包并以隐身模式启动应用。


Mac 用户运行 Interview Coder（开源版）的步骤

  1. 前提准备：
    - 确保 macOS 13 或更高版本。
    - 安装 Node.js 18 或更新版本（从官网下载安装）。
    - 克隆项目仓库到本地目录（如 git clone <repo-url> interview-coder）。
    - 进入项目目录：cd interview-coder。
    - 安装依赖：npm install。
  2. 授予权限：
    - 在“系统设置 → 隐私与安全性 → 屏幕录制”中，勾选 Terminal（或你的 IDE），允许全局快捷键和截图功能。
    - 若需动态权限，应用启动后可能需额外授权。
  3. 启动应用：
    - 该项目提供 stealth-run.sh 脚本（隐身模式启动，默认窗口不可见）。
    - 赋予执行权限：chmod +x stealth-run.sh。
    - 运行脚本：./stealth-run.sh。
        - 脚本会自动清理旧构建、执行 npm run build，然后后台启动 Electron 应用。
    - 首次运行可能需几分钟构建。


3. 启动后按 Ctrl + B 显示主窗口，在设置面板中填写 API Key 后即可使用。（推荐使用gemini2.5flash）
4. （推荐使用gemini2.5flash）
5. （推荐使用gemini2.5flash）
6. （推荐使用gemini2.5flash）

### 常用快捷键
| 功能 | 快捷键 |
| --- | --- |
| 显示或隐藏窗口 | Ctrl + B |
| 捕获截图 | Ctrl + H |
| 处理当前截图 | Ctrl + Enter |
| 删除最新截图 | Ctrl + L |
| 重置会话 | Ctrl + R |
| 移动窗口 | Ctrl + 方向键 |
| 调整透明度 | Ctrl + [（降低）/ Ctrl + ]（升高） |
| 退出应用 | Ctrl + Q |

提示：若窗口不可见或无法拖动，请先按一次 Ctrl + B 使其可见，再配合方向键或透明度快捷键调整位置。

## 界面说明
- Queue：展示当前截图列表，支持删除与重新截图；右侧浮窗列出常用指令与状态提示。
- Solutions：展示模型输出的思路、答案或代码、复杂度以及关键要点，可继续截取新的上下文并再次求解。
- Debug：针对已有答案的复查模式，上传报错截图让模型指出问题与修复建议。

## API Key 与配置
- API Key 在设置面板中管理，可随时切换模型供应商。
- 本地配置默认路径：
  - Windows：%APPDATA%\interview-coder-v1\config.json
  - macOS：~/Library/Application Support/interview-coder-v1/config.json
- 删除该文件可重置登录与模型设定。

## 开发与构建
- 开发调试：

       npm run dev

- 手动构建（通常由 stealth-run.bat 调用）：

       npm run build

- 打包安装包：npm run package / npm run package-win / npm run package-mac

## 常见问题
- 窗口不见了？应用仍在后台。按 Ctrl + B 切换可见性，或在任务管理器结束 electron 进程后重新运行脚本。
- 快捷键失效？确认系统授予屏幕录制或全局快捷键权限。macOS 需在“系统设置 → 隐私与安全性 → 屏幕录制”中勾选终端或 IDE。
- 模型调用失败？核对 API Key 是否正确、额度是否充足，可在设置面板切换其他模型测试。

## 贡献指南
欢迎通过 Issue 或 Pull Request 反馈 bug、扩展功能或改进提示词。提交前请确认：
- 已执行 npm run lint
- 相关文档（如 README、脚本说明）同步更新

---
保持开源、免费与透明是本项目的初衷，愿它帮助你在算法与工程面试中更高效地练习、复盘与提高。
