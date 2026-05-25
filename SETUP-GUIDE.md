# 📋 JB Beauty Expo 2026 — 部署指南

照着以下步骤做，大概需要 **20-30 分钟**。

---

## 第一步：创建 Supabase 数据库

1. 打开 [https://supabase.com](https://supabase.com)
2. 点击 **"Start your project"** → 用 GitHub 账号登录
3. 点击 **"New project"**
4. 填写：
   - **Name**：`jb-beauty-expo`
   - **Database Password**：设一个密码（记下来）
   - **Region**：选 `Southeast Asia (Singapore)`
5. 点击 **"Create new project"** → 等大约 1 分钟

6. 进入项目后，点击左边的 **"SQL Editor"**
7. 点击 **"New query"**
8. 打开本项目的 `supabase-setup.sql` 文件，把里面**所有内容**复制粘贴进去
9. 点击 **"Run"** 按钮 → 看到 "Success" 就好了

10. 点击左边 **"Project Settings"** → **"API"**
11. 记下这两个值（待会要用）：
    - **Project URL**：`https://xxxxxxxx.supabase.co`
    - **anon public key**：一串很长的字母

---

## 第二步：把代码上传到 GitHub

1. 打开 [https://github.com](https://github.com) 并登录
2. 点击右上角 **"+"** → **"New repository"**
3. **Repository name**：`jb-beauty-expo`
4. 选 **Private**（私密）
5. 点击 **"Create repository"**

6. 在新建的 repo 页面，点击 **"uploading an existing file"**
7. 把以下文件/文件夹拖进去上传：
   ```
   package.json
   next.config.js
   .env.local.example
   supabase-setup.sql
   lib/
   pages/
   ```
8. 点击 **"Commit changes"**

---

## 第三步：部署到 Vercel

1. 打开 [https://vercel.com](https://vercel.com)
2. 点击 **"Sign Up"** → 选 **"Continue with GitHub"**
3. 点击 **"Add New Project"**
4. 找到 `jb-beauty-expo` → 点击 **"Import"**
5. 不要改任何设置，直接往下找 **"Environment Variables"**
6. 添加两个变量：

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | 你在 Supabase 复制的 Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你在 Supabase 复制的 anon key |

7. 点击 **"Deploy"** → 等大约 2 分钟
8. 看到 🎉 就成功了！点击 **"Visit"** 打开网站

---

## 第四步：两个人一起用

- Vercel 会给你一个网址，例如：`https://jb-beauty-expo-xxx.vercel.app`
- 把这个网址发给同事
- 两个人打开同一个网址就可以**实时同步**数据了！

---

## ❓ 常见问题

**页面白屏 / 报错**
→ 检查 Vercel 的 Environment Variables 有没有填对

**数据没有同步**
→ 刷新页面；或检查 Supabase 的 Realtime 有没有启动

**想修改产品数据**
→ 直接在网站里改，不需要动代码

---

如有问题，截图发给我！
