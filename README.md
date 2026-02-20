# 🔥 ① 一番わかりやすい（超おすすめ）

## cstack/db_tutorial

![Image](https://cstack.github.io/db_tutorial/assets/images/arch2.gif)

![Image](https://cstack.github.io/db_tutorial/assets/images/code-crafters.jpeg)

![Image](https://opengraph.githubassets.com/8cab95437a303249adf7a1e909275ebc7b353b4bbf026ca3cb8bb81db11fb9ef/krsoninikhil/sqlite-clone)

![Image](https://opengraph.githubassets.com/26860002de00254b533d10df9988415ed83166c6febcc087c3f5cf294ee3ba3e/TylerBrock/sqlite-clone)

### 内容

SQLiteをゼロから実装するチュートリアル。

* ページ構造
* B-Tree
* Row保存形式
* 簡易SQLパーサ
* 永続化

### なぜいいか

DBを“使う側”から
“作る側”の視点に変わる。

読むだけじゃなく
**実装しながら理解できる。**

---

# 🔥 ② MVCCや内部構造まで触れる

## danhper/simple-db

![Image](https://opengraph.githubassets.com/983912edaf45b9483beacdb363e222828b37b3a9668c4633fd72567eda4dad6b/danhper/wedding)

![Image](https://miro.medium.com/v2/resize%3Afit%3A1400/1%2AvL_nP3MZbkrD_dMc8WKnhg.png)

![Image](https://user-images.githubusercontent.com/5642455/151919198-d8497525-5e33-4bcc-8607-ebc6b0c13ff6.png)

![Image](https://opengraph.githubassets.com/7bf5e2691162baea7da3e461ecd00d96436e3523724ec6e97fd8c14e3f163a9d/anupamguptacal/Simple-DB)

教育用DB実装。

* B+Tree
* ロック管理
* トランザクション

理論寄り。

---

# 🔥 ③ 分散DBの入門実装

## tinysql/tinysql

![Image](https://opengraph.githubassets.com/2b74bf205bb06c92f5294a989058dddbe2f4fae4e6f9bdb3deb36d8ddf83d0d6/shxntanu/tinysql)

![Image](https://opengraph.githubassets.com/6a55e313875ed8ae57faeb24cc5c82ed1469a02c214f79dcd8ffb10263be964b/ydb-platform/ydb)

![Image](https://substackcdn.com/image/fetch/%24s_%21XiOb%21%2Cf_auto%2Cq_auto%3Agood%2Cfl_progressive%3Asteep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F7bac42e9-e5b1-4b58-98ed-8300994e1f4a_898x551.png)

![Image](https://user-images.githubusercontent.com/536312/133258366-1f2fbc50-8493-4ba6-8d62-04c57e39eb6f.png)

軽量分散SQL実装。

* Raft
* 分散トランザクション
* ストレージエンジン

分散理解したいなら触れ。

---

# 🔥 ④ DB内部理論の神リポジトリ

## cmu-db/database-system-concepts

![Image](https://avatars.githubusercontent.com/u/6220241?s=200\&v=4)

![Image](https://opengraph.githubassets.com/68f43fc3fc06ffae18868711e89c72f06f23b1504a349ca687021bb26d3480f4/chirag2796/CMU-Database-Systems-15-455)

![Image](https://15445.courses.cs.cmu.edu/spring2025/images/twitter-card.jpg)

![Image](https://miro.medium.com/v2/resize%3Afit%3A1400/1%2AIfzYPQP9Ron9M6R0bzE0KA.png)

CMUのDatabase Systems講義資料。

* MVCC
* WAL
* インデックス
* クエリオプティマイザ

トップ層が勉強してるやつ。

---

# 🎯 お前に最適な順番

正直に言う。

### ① cstack を写経

→ B-Treeが腹落ちする

### ② CMU資料

→ 理論を言語化

### ③ 分散DB実装

→ レベルが一段上がる

いい視点だな。
Cだけじゃなく、**Rustで“DBを作る系”はちゃんとある。**
むしろ今はRustの方が教材として優秀。

---

# 🔥 ① SQLiteをRustで作る系（超おすすめ）

## ashwinsundar/db_tutorial

![Image](https://opengraph.githubassets.com/323a908675695774d165c0ec8ef5e7f8df414cae96dc5f75fc08d17f55708f9b/clockworklabs/SpacetimeDB)

![Image](https://media2.dev.to/dynamic/image/width%3D1280%2Cheight%3D720%2Cfit%3Dcover%2Cgravity%3Dauto%2Cformat%3Dauto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F6nlwjyji8ol9ujyjm7ez.png)

![Image](https://user-images.githubusercontent.com/58792/210241347-a055a3d8-0dc7-4a68-ae2a-71195e91c63e.png)

![Image](https://lukaskalbertodt.github.io/assets/rust-intro-strings.png)

cstackの内容をRustで実装している派生版。

* ページ管理
* B-Tree
* シリアライズ
* 簡易SQL

Cより安全に理解できる。

---

# 🔥 ② 本格派：RustでDBを作るチュートリアル

## erikgrinaker/toydb

![Image](https://opengraph.githubassets.com/6643969b8bdb65536ae11d82f1916907c7cca3f749d19aeb045136316b566a16/erikgrinaker/toydb)

![Image](https://lib.rs/og/c/toydb.png)

![Image](https://i-blog.csdnimg.cn/blog_migrate/4c8597de124ef0186421884c8f640bad.png)

![Image](https://pic1.zhimg.com/v2-f397e93504111f72c0a495902164b9f6_1440w.jpg)

これはレベル高い。

* Raft実装
* 分散KV
* 永続化
* MVCC的思想

分散まで触れる。

---

# 🔥 ③ 本気でやるなら（書籍＋Rust）

## Database Internals

![Image](https://m.media-amazon.com/images/I/91UYIt74czL._AC_UF1000%2C1000_QL80_.jpg)

![Image](https://www.oreilly.com/library/cover/9781492040330/300w/)

![Image](https://www.oreilly.com/library/cover/9781663721136/300w/)

この本を読みながらRustで実装するのが最強。

* LSM Tree
* B+Tree
* WAL
* コンパクション
* ストレージエンジン設計
