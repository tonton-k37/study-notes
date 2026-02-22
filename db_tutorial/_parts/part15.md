---
title: Part 15 - まとめと今後の学習
date: 2024-03-04
---

> 🎯 **このパートを学ぶ理由**: チュートリアル全体の振り返り。何を作り、何を学んだかを整理し、さらなる学習の方向性を見つける。

## 学んだこと

このチュートリアルを通じて、SQLiteクローンの以下のコンポーネントをゼロから構築した：

### フロントエンド
- **REPL**（Part 1）— 対話型シェルの入力ループ
- **SQLコンパイラ**（Part 2）— SQL文のパースとバイトコード生成
- **メタコマンド処理** — `.exit`などの非SQL命令

### バックエンド
- **仮想マシン**（Part 2）— バイトコードの実行エンジン
- **テーブル/行のシリアライズ**（Part 3）— メモリ上のデータ表現
- **Pager**（Part 5）— メモリ↔ディスクのページキャッシュ
- **カーソル**（Part 6）— テーブル走査の抽象化
- **B-Tree**（Part 7-14）— 検索・挿入・分割を含む完全な実装

### テスト
- **RSpecテスト**（Part 4）— 統合テストによるバグ検出

## 実装していないもの（発展課題）

このチュートリアルではカバーしていないが、実際のDBには必要な機能：

| 機能 | 概要 |
|------|------|
| DELETE文 | 行の削除とB-Treeからのキー除去 |
| UPDATE文 | 既存行の値の変更 |
| WHERE句 | 条件付きSELECT |
| 複数テーブル | テーブルの作成・切り替え |
| インデックス | プライマリキー以外のカラムでの高速検索 |
| トランザクション | ACID特性の実装 |
| クラッシュリカバリ | WAL（Write-Ahead Logging）の実装 |

## さらなる学習リソース

- [SQLite公式ドキュメント](https://www.sqlite.org/arch.html) — 本物のSQLiteアーキテクチャ
- [Build your own X](https://github.com/codecrafters-io/build-your-own-x) — DB以外にもDocker、Redis、Git等のチュートリアル集
- [CMU Database Group - Intro to Database Systems](https://15445.courses.cs.cmu.edu/) — アカデミックなDB講座（無料）
- [Database Internals](https://www.databass.dev/) — Alex Petrov著、DB内部構造の解説書

---

<div align="center">

[← 前へ: Part 14 - 内部ノードの分割](./part14.md)

</div>
