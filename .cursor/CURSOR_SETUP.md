# Cursor 配置说明（归档）

**当前请以仓库内已生成的文件为准：**

- Rules：`d:\AIFace\.cursor\rules\*.mdc`
- Skills：`d:\AIFace\.cursor\skills\*\SKILL.md`
- 索引：[AGENTS.md](../AGENTS.md)

下文保留为极简备份，**不必再手动复制**。

---

## 若从零重建 Rules

将 `AGENTS.md` 中表格所列主题分别写入对应 `.mdc`（YAML frontmatter + Markdown 正文），并设置 `alwaysApply` / `globs`。

## 若从零重建 Skills

每个 Skill 为独立目录，内含 `SKILL.md`，frontmatter 含 `name`（小写+连字符）与 `description`（第三人称 + 触发场景）。
