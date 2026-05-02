# インストール済み成果物（不要時の削除用メモ）

作成日: 2026-05-02
ハッカソン: Clawathon Tokyo Edition

このプロジェクトのために**新規にインストール/作成したもの**を、削除順に記録。
削除は基本「下から上」（依存逆順）で安全。

---

## 1. システムワイド（OS全体に影響）

### Homebrew
| パッケージ | バージョン | 削除コマンド |
|----------|-----------|-------------|
| `deno` | 2.7.14 | `brew uninstall deno` |
| 依存: jpeg-turbo, xz, little-cms2, sqlite | — | `brew autoremove`（使ってなければ） |

### npm global
| パッケージ | バージョン | 削除コマンド |
|----------|-----------|-------------|
| `openclaw` | 2026.4.29 | `npm uninstall -g openclaw` |

### OpenClaw daemon（onboard後に存在）
| 項目 | 場所 | 削除コマンド |
|------|------|-------------|
| launchd service | `~/Library/LaunchAgents/` 配下 | `openclaw daemon uninstall` または onboard で再構成 |
| state | `~/.openclaw/` | `rm -rf ~/.openclaw` |

---

## 2. ユーザー設定ディレクトリ

| パス | 内容 | 削除 |
|------|------|------|
| `~/.config/jupiter/.env` | JUPITER_API_KEY (mode 600) | `rm ~/.config/jupiter/.env && rmdir ~/.config/jupiter` |
| `~/.openclaw/` | OpenClaw state, plugins | `rm -rf ~/.openclaw` |

---

## 3. Claude Code プラグイン

| プラグイン | 場所 | 削除 |
|----------|------|------|
| `integrate-jupiter@jup-ag-skills` | user scope | `claude plugin uninstall integrate-jupiter@jup-ag-skills` |
| marketplace `jup-ag-skills` | user scope | `claude plugin marketplace remove jup-ag-skills` |

確認: `claude plugin list` / `claude plugin marketplace list`

---

## 4. プロジェクト内に作成したもの

リポジトリ削除（`rm -rf clawathon-tokyo-edition`）すれば全部消えるが、参考まで:

| パス | 内容 |
|------|------|
| `CLAUDE.md` | プロジェクト用Jupiter文脈宣言 |
| `docs/hackathon-ideas-jupiter.md` | アイデア整理 |
| `docs/installed-artifacts.md` | このファイル |
| `vendor/agent-skills/` | `git clone https://github.com/jup-ag/agent-skills` |
| `vendor/jupiter-agent-handson/` | `git clone https://github.com/posaune0423/jupiter-agent-handson` |
| `prototype/` | Node.jsプロジェクト（package.json + node_modules） |
| `prototype/node_modules/` | npm packages: `@solana/web3.js`, `bn.js`, `@jup-ag/lend`, `@jup-ag/lend-read` 等 ~370個 |
| `prototype/smoke-read.mjs` | Jupiter Lend SDK スモークテスト |
| `prototype/inspect-sdk.mjs`, `inspect-rate.mjs` | デバッグ用 |

---

## 5. 一括削除手順（ハッカソン後完全クリーンアップ）

```bash
# 1. APIキーをローテート（portal.jup.ag で旧キー削除）

# 2. Claude Code plugin
claude plugin uninstall integrate-jupiter@jup-ag-skills
claude plugin marketplace remove jup-ag-skills

# 3. OpenClaw daemon と state
# (onboard 済みなら) openclaw daemon uninstall も実行
rm -rf ~/.openclaw

# 4. グローバルパッケージ
npm uninstall -g openclaw
brew uninstall deno
brew autoremove

# 5. ユーザー設定
rm ~/.config/jupiter/.env
rmdir ~/.config/jupiter 2>/dev/null

# 6. プロジェクト全削除（または vendor/, prototype/ だけ消す）
# rm -rf /Users/masashi_mac_ssd/Developer/clawathon-tokyo-edition
```

---

## 6. 削除しなくてOKなもの

- Node.js v24.13.0（既存、Jupiterと無関係）
- git 2.45.0（既存）
- brew で入った deno の依存（jpeg-turbo, xz, sqlite, little-cms2）— 他で使われている可能性あるので `brew autoremove` 任せ

---

**メモ**: APIキーがチャット履歴に残っているので、ハッカソン終了時に必ず `portal.jup.ag` でキー削除＋再発行することを推奨。
