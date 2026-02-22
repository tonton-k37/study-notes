---
title: Part 13 - 分割後の親ノードの更新
date: 2017-11-26
---

> 🎯 **このパートを学ぶ理由**: リーフノード分割後に親（内部ノード）を正しく更新する。ツリーの整合性維持は実装上最もバグが出やすい部分。
> **前提知識**: Part 10-12（ノード分割 + 検索 + スキャン）

壮大なB-tree実装の旅の次のステップとして、リーフノード分割後の親ノードの修正を行う。以下の例を参考にする：

{% include image.html url="assets/images/updating-internal-node.png" description="内部ノードの更新の例" %}

この例では、キー「3」をツリーに追加する。これにより左のリーフノードが分割される。分割後、以下のことを行ってツリーを修正する：

1. 親の最初のキーを左の子の最大キー（「3」）に更新する
2. 更新されたキーの後に新しい子ポインタ/キーペアを追加する
  - 新しいポインタは新しい子ノードを指す
  - 新しいキーは新しい子ノードの最大キー（「5」）

まず、スタブコードを2つの新しい関数呼び出しに置き換える：ステップ1用の`update_internal_node_key()`とステップ2用の`internal_node_insert()`。


```diff
@@ -670,9 +725,11 @@ void leaf_node_split_and_insert(Cursor* cursor, uint32_t key, Row* value) {
   */

   void* old_node = get_page(cursor->table->pager, cursor->page_num);
+  uint32_t old_max = get_node_max_key(old_node);
   uint32_t new_page_num = get_unused_page_num(cursor->table->pager);
   void* new_node = get_page(cursor->table->pager, new_page_num);
   initialize_leaf_node(new_node);
+  *node_parent(new_node) = *node_parent(old_node);
   *leaf_node_next_leaf(new_node) = *leaf_node_next_leaf(old_node);
   *leaf_node_next_leaf(old_node) = new_page_num;

@@ -709,8 +766,12 @@ void leaf_node_split_and_insert(Cursor* cursor, uint32_t key, Row* value) {
   if (is_node_root(old_node)) {
     return create_new_root(cursor->table, new_page_num);
   } else {
-    printf("Need to implement updating parent after split\n");
-    exit(EXIT_FAILURE);
+    uint32_t parent_page_num = *node_parent(old_node);
+    uint32_t new_max = get_node_max_key(old_node);
+    void* parent = get_page(cursor->table->pager, parent_page_num);
+
+    update_internal_node_key(parent, old_max, new_max);
+    internal_node_insert(cursor->table, parent_page_num, new_page_num);
+    return;
   }
 }
```

親への参照を取得するために、各ノードに親ノードへのポインタを記録し始める必要がある。

```diff
+uint32_t* node_parent(void* node) { return node + PARENT_POINTER_OFFSET; }
```
```diff
@@ -660,6 +675,48 @@ void create_new_root(Table* table, uint32_t right_child_page_num) {
   uint32_t left_child_max_key = get_node_max_key(left_child);
   *internal_node_key(root, 0) = left_child_max_key;
   *internal_node_right_child(root) = right_child_page_num;
+  *node_parent(left_child) = table->root_page_num;
+  *node_parent(right_child) = table->root_page_num;
 }
```

次に、親ノード内の影響を受けるセルを見つける必要がある。子は自分のページ番号を知らないので、それを検索することはできない。しかし、自分の最大キーは知っているので、親ノードでそのキーを検索できる。

```diff
+void update_internal_node_key(void* node, uint32_t old_key, uint32_t new_key) {
+  uint32_t old_child_index = internal_node_find_child(node, old_key);
+  *internal_node_key(node, old_child_index) = new_key;
 }
```

`internal_node_find_child()`では、内部ノード内のキーを見つける既存のコードを再利用する。`internal_node_find()`を新しいヘルパーメソッドを使うようリファクタリングする。

```diff
-Cursor* internal_node_find(Table* table, uint32_t page_num, uint32_t key) {
-  void* node = get_page(table->pager, page_num);
+uint32_t internal_node_find_child(void* node, uint32_t key) {
+  /*
+  指定されたキーを含むべき子のインデックスを返す
+  */
+
   uint32_t num_keys = *internal_node_num_keys(node);

-  /* 検索すべき子のインデックスを二分探索で見つける */
+  /* 二分探索 */
   uint32_t min_index = 0;
   uint32_t max_index = num_keys; /* キーより1つ多い子がある */

@@ -386,7 +394,14 @@ Cursor* internal_node_find(Table* table, uint32_t page_num, uint32_t key) {
     }
   }

-  uint32_t child_num = *internal_node_child(node, min_index);
+  return min_index;
+}
+
+Cursor* internal_node_find(Table* table, uint32_t page_num, uint32_t key) {
+  void* node = get_page(table->pager, page_num);
+
+  uint32_t child_index = internal_node_find_child(node, key);
+  uint32_t child_num = *internal_node_child(node, child_index);
   void* child = get_page(table->pager, child_num);
   switch (get_node_type(child)) {
     case NODE_LEAF:
```

この記事の核心、`internal_node_insert()`の実装に入る。順を追って説明する。

```diff
+void internal_node_insert(Table* table, uint32_t parent_page_num,
+                          uint32_t child_page_num) {
+  /*
+  子に対応する新しい子/キーペアを親に追加する
+  */
+
+  void* parent = get_page(table->pager, parent_page_num);
+  void* child = get_page(table->pager, child_page_num);
+  uint32_t child_max_key = get_node_max_key(child);
+  uint32_t index = internal_node_find_child(parent, child_max_key);
+
+  uint32_t original_num_keys = *internal_node_num_keys(parent);
+  *internal_node_num_keys(parent) = original_num_keys + 1;
+
+  if (original_num_keys >= INTERNAL_NODE_MAX_CELLS) {
+    printf("Need to implement splitting internal node\n");
+    exit(EXIT_FAILURE);
+  }
```

新しいセル（子/キーペア）の挿入位置は、新しい子の最大キーに依存する。例では、`child_max_key`は5で`index`は1になる。

内部ノードにセルを追加する余地がない場合はエラーにする。後で実装する。

関数の残りを見てみよう：

```diff
+
+  uint32_t right_child_page_num = *internal_node_right_child(parent);
+  void* right_child = get_page(table->pager, right_child_page_num);
+
+  if (child_max_key > get_node_max_key(right_child)) {
+    /* 右の子を置き換え */
+    *internal_node_child(parent, original_num_keys) = right_child_page_num;
+    *internal_node_key(parent, original_num_keys) =
+        get_node_max_key(right_child);
+    *internal_node_right_child(parent) = child_page_num;
+  } else {
+    /* 新しいセルのためにスペースを空ける */
+    for (uint32_t i = original_num_keys; i > index; i--) {
+      void* destination = internal_node_cell(parent, i);
+      void* source = internal_node_cell(parent, i - 1);
+      memcpy(destination, source, INTERNAL_NODE_CELL_SIZE);
+    }
+    *internal_node_child(parent, index) = child_page_num;
+    *internal_node_key(parent, index) = child_max_key;
+  }
+}
```

最も右の子ポインタは他の子/キーペアとは別に保存されているため、新しい子が最も右の子になる場合は異なる処理が必要だ。

この例では`else`ブロックに入る。まず、新しいセルのために他のセルを1つ右にずらしてスペースを空ける（この例ではずらすセルは0個だが）。

次に、`index`で決まったセルに新しい子ポインタとキーを書き込む。

テストケースのサイズを小さくするために、`INTERNAL_NODE_MAX_CELLS`を今のところハードコードしておく：

```diff
@@ -126,6 +126,8 @@ const uint32_t INTERNAL_NODE_KEY_SIZE = sizeof(uint32_t);
 const uint32_t INTERNAL_NODE_CHILD_SIZE = sizeof(uint32_t);
 const uint32_t INTERNAL_NODE_CELL_SIZE =
     INTERNAL_NODE_CHILD_SIZE + INTERNAL_NODE_KEY_SIZE;
+/* テスト用に小さくしておく */
+const uint32_t INTERNAL_NODE_MAX_CELLS = 3;
```

テストについて、大規模データセットテストは旧スタブを通過し、新しいスタブに到達する：

```diff
@@ -65,7 +65,7 @@ describe 'database' do
     result = run_script(script)
     expect(result.last(2)).to match_array([
       "db > Executed.",
-      "db > Need to implement updating parent after split",
+      "db > Need to implement splitting internal node",
     ])
```

実に満足感がある。

4ノードのツリーを表示するテストも追加する。連続IDだけでなく、擬似ランダムな順序でレコードを追加してより多くのケースをテストする。

```diff
+  it 'allows printing out the structure of a 4-leaf-node btree' do
+    script = [
+      "insert 18 user18 person18@example.com",
+      "insert 7 user7 person7@example.com",
+      "insert 10 user10 person10@example.com",
+      "insert 29 user29 person29@example.com",
+      "insert 23 user23 person23@example.com",
+      "insert 4 user4 person4@example.com",
+      "insert 14 user14 person14@example.com",
+      "insert 30 user30 person30@example.com",
+      "insert 15 user15 person15@example.com",
+      "insert 26 user26 person26@example.com",
+      "insert 22 user22 person22@example.com",
+      "insert 19 user19 person19@example.com",
+      "insert 2 user2 person2@example.com",
+      "insert 1 user1 person1@example.com",
+      "insert 21 user21 person21@example.com",
+      "insert 11 user11 person11@example.com",
+      "insert 6 user6 person6@example.com",
+      "insert 20 user20 person20@example.com",
+      "insert 5 user5 person5@example.com",
+      "insert 8 user8 person8@example.com",
+      "insert 9 user9 person9@example.com",
+      "insert 3 user3 person3@example.com",
+      "insert 12 user12 person12@example.com",
+      "insert 27 user27 person27@example.com",
+      "insert 17 user17 person17@example.com",
+      "insert 16 user16 person16@example.com",
+      "insert 13 user13 person13@example.com",
+      "insert 24 user24 person24@example.com",
+      "insert 25 user25 person25@example.com",
+      "insert 28 user28 person28@example.com",
+      ".btree",
+      ".exit",
+    ]
+    result = run_script(script)
```

そのままだと以下の出力になる：

```
- internal (size 3)
  - leaf (size 7)
    - 1
    - 2
    - 3
    - 4
    - 5
    - 6
    - 7
  - key 1
  - leaf (size 8)
    - 8
    - 9
    - 10
    - 11
    - 12
    - 13
    - 14
    - 15
  - key 15
  - leaf (size 7)
    - 16
    - 17
    - 18
    - 19
    - 20
    - 21
    - 22
  - key 22
  - leaf (size 8)
    - 23
    - 24
    - 25
    - 26
    - 27
    - 28
    - 29
    - 30
db >
```

よく見るとバグが見つかる：
```
    - 5
    - 6
    - 7
  - key 1
```

ここのキーは7であるべきで、1ではない！

デバッグの結果、ポインタ演算の誤りが原因だとわかった。

```diff
 uint32_t* internal_node_key(void* node, uint32_t key_num) {
-  return internal_node_cell(node, key_num) + INTERNAL_NODE_CHILD_SIZE;
+  return (void*)internal_node_cell(node, key_num) + INTERNAL_NODE_CHILD_SIZE;
 }
```

`INTERNAL_NODE_CHILD_SIZE`は4だ。意図は`internal_node_cell()`の結果に4バイトを加算することだったが、`internal_node_cell()`が`uint32_t*`を返すため、実際には`4 * sizeof(uint32_t)`バイトを加算していた。演算前に`void*`にキャストすることで修正した。

注意！[voidポインタに対するポインタ演算はC言語の標準規格に含まれておらず、コンパイラによっては動作しない可能性がある](https://stackoverflow.com/questions/3523145/pointer-arithmetic-for-void-pointer-in-c/46238658#46238658)。今後移植性に関する記事を書くかもしれないが、今のところvoidポインタ演算はそのままにしておく。

よし。完全に動作するbtree実装に向けてもう1歩だ。次のステップは内部ノードの分割だ。それではまた！

---

<div align="center">

[← 前へ: Part 12 - 複数階層のスキャン](./part12.md) | [次へ: Part 14 - 内部ノードの分割 →](./part14.md)

</div>
