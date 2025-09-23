# macOS 安装指南

## 🛠️ 前置要求

### 系统要求
- **macOS版本**: macOS 10.15 (Catalina) 或更高版本
- **架构支持**: Intel (x64) 和 Apple Silicon (M1/M2)
- **权限**: 需要管理员权限安装

### 必要权限
在运行应用之前，需要在系统偏好设置中配置以下权限：

1. **屏幕录制权限**
   - 打开 **系统偏好设置 > 安全性与隐私 > 屏幕录制**
   - 勾选 **Interview Coder**

2. **辅助功能权限**
   - 打开 **系统偏好设置 > 安全性与隐私 > 辅助功能**
   - 添加 **Interview Coder** 并勾选

3. **通知权限（可选）**
   - 打开 **系统偏好设置 > 通知 > Interview Coder**
   - 根据需要配置通知设置

## 📥 安装步骤

### 方法1：使用预构建的DMG文件（推荐）

1. **下载DMG文件**
   ```bash
   # 从GitHub Releases下载适用于macOS的版本
   wget https://github.com/ibttf/interview-coder/releases/latest/download/Interview-Coder-mac.dmg
   ```

2. **安装应用**
   - 双击下载的 `.dmg` 文件
   - 将 `Interview Coder` 拖到 Applications 文件夹
   - 弹出DMG文件

3. **首次运行**
   ```bash
   open -a "Interview Coder"
   ```

### 方法2：使用开发者签名版本

如果遇到权限问题，需要手动签名：

```bash
# 需要先安装依赖
brew install node

# 克隆仓库
git clone https://github.com/ibttf/interview-coder.git
cd interview-coder

# 安装依赖
npm install

# 构建并签名（需要有效的开发者证书）
npm run build
npm run package-mac
```

## 🔐 解决签名校验问题

### 如果系统阻止启动

如果看到""Interview Coder" 来自未识别的开发者"的错误：

1. 打开 **系统偏好设置 > 安全性与隐私 > 通用**
2. 点击 **"仍要打开"**

### 手动移除签名验证

```bash
# 移除Gatekeeper限制
sudo xattr -cr /Applications/Interview\ Coder.app

# 如果应用损坏，尝试：
sudo xattr -dr com.apple.quarantine /Applications/Interview\ Coder.app
```

## ⚙️ 故障排除

### 常见问题及解决方案

#### 1. 截图失败

**症状**: 无法捕获屏幕，或截图工具报错

**解决方案**:
```bash
# 重置隐私权限（可能需要管理员密码）
tccutil reset ScreenCapture com.chunginlee.interviewcoder

# 或者完全重置隐私数据库
sudo tccutil reset ScreenCapture
```

#### 2. 窗口透明度问题

**症状**: 主窗口显示异常或无法显示

**解决方案**:
```bash
# 启用辅助功能权限
tccutil reset Accessibility com.chunginlee.interviewcoder
```

#### 3. 应用崩溃或无法启动

**症状**: 应用启动后立即退出或卡住

**解决方案**:
```bash
# 查看崩溃报告
~/Library/Logs/DiagnosticReports/

# 查看应用日志（如果有）
~/Library/Logs/Interview\ Coder/
```

#### 4. 权限拒绝错误

**症状**: 看到的错误信息包含 "permission denied"

**解决方案**:
```bash
# 修复应用权限
sudo chmod -R 755 /Applications/Interview\ Coder.app
sudo chown -R $USER:$USER /Applications/Interview\ Coder.app
```

## 🧪 高级调试

### 开发者模式运行

```bash
# 在开发模式下运行（带有详细日志）
cd interview-coder
npm run dev

# 查看详细日志
tail -f ~/Library/Logs/Interview\ Coder/app.log
```

### 手动截图测试

```bash
# 直接测试屏幕截图功能
screencapture -i -C ~/Desktop/test-screenshot.png
```

## 📧 技术支持

如果遇到问题：

1. **检查要求**: 确保macOS版本符合要求
2. **重新安装**: 删除旧版本后重新安装
3. **提供信息**: 向开发者提供macOS版本和错误日志
4. **社区支持**: 访问GitHub Issues页面获取帮助

## 🔄 更新管理

### 自动更新
应用内置自动更新功能，当有新版本发布时会自动提示。

### 手动检查更新
```bash
# 在应用的菜单中选择"检查更新"
# 或者在终端中运行
open -b com.chunginlee.interviewcoder --args --check-updates
```

## 🚫 卸载

```bash
# 从Applications文件夹删除应用
sudo rm -rf /Applications/Interview\ Coder.app

# 清除用户数据
rm -rf ~/Library/Application\ Support/interview-coder-v1
rm -rf ~/Library/Logs/Interview\ Coder
```