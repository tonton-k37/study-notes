---
title: Part 12 - 複数階層B-Treeのスキャン
date: 2017-11-11
---

複数階層のbtreeを構築できるようになったが、その過程で`select`文が壊れてしまった。15行を挿入してから全行を表示しようとするテストケースがこちら：

```diff
+  it 'prints all rows in a multi-level tree' do
+    script = []
+    (1..15).each do |i|
+      script << "insert #{i} user#{i} person#{i}@example.com"
+    end
+    script << "select"
+    script << ".exit"
+    result = run_script(script)
+
+    expect(result[15...result.length]).to match_array([
+      "db > (1, user1, person1@example.com)",
+      "(2, user2, person2@example.com)",
+      "(3, user3, person3@example.com)",
+      "(4, user4, person4@example.com)",
+      "(5, user5, person5@example.com)",
+      "(6, user6, person6@example.com)",
+      "(7, user7, person7@example.com)",
+      "(8, user8, person8@example.com)",
+      "(9, user9, person9@example.com)",
+      "(10, user10, person10@example.com)",
+      "(11, user11, person11@example.com)",
+      "(12, user12, person12@example.com)",
+      "(13, user13, person13@example.com)",
+      "(14, user14, person14@example.com)",
+      "(15, user15, person15@example.com)",
+      "Executed.", "db > ",
+    ])
+  end
```

しかし、今このテストケースを実行すると、実際に起こるのはこうだ：

```
db > select
(2, user1, person1@example.com)
Executed.
```

おかしい。1行しか表示されず、その行はデータが壊れている（idとusernameが一致していない）。

原因は、`execute_select()`がテーブルの先頭から開始するが、現在の`table_start()`の実装がルートノードのセル0を返すためだ。しかし、ツリーのルートは今や内部ノードであり、行を含んでいない。表示されたデータは、ルートノードがリーフノードだった時に残ったものだ。`execute_select()`は本来、最も左のリーフノードのセル0を返すべきだ。

古い実装を削除する：

```diff
-Cursor* table_start(Table* table) {
-  Cursor* cursor = malloc(sizeof(Cursor));
-  cursor->table = table;
-  cursor->page_num = table->root_page_num;
-  cursor->cell_num = 0;
-
-  void* root_node = get_page(table->pager, table->root_page_num);
-  uint32_t num_cells = *leaf_node_num_cells(root_node);
-  cursor->end_of_table = (num_cells == 0);
-
-  return cursor;
-}
```

キー0（最小のキー）を検索する新しい実装を追加する。テーブルにキー0が存在しなくても、このメソッドは最小のid（最も左のリーフノードの先頭）の位置を返す。

```diff
+Cursor* table_start(Table* table) {
+  Cursor* cursor =  table_find(table, 0);
+
+  void* node = get_page(table->pager, cursor->page_num);
+  uint32_t num_cells = *leaf_node_num_cells(node);
+  cursor->end_of_table = (num_cells == 0);
+
+  return cursor;
+}
```

この変更を加えても、まだ1ノード分の行しか表示されない：

```
db > select
(1, user1, person1@example.com)
(2, user2, person2@example.com)
(3, user3, person3@example.com)
(4, user4, person4@example.com)
(5, user5, person5@example.com)
(6, user6, person6@example.com)
(7, user7, person7@example.com)
Executed.
db >
```

15エントリの場合、btreeは1つの内部ノードと2つのリーフノードで構成され、こんな形になる：

{% include image.html url="assets/images/btree3.png" description="btreeの構造" %}

テーブル全体をスキャンするには、最初のリーフノードの末尾に到達した後、2番目のリーフノードにジャンプする必要がある。そのために、リーフノードヘッダに「next_leaf」という新しいフィールドを追加する。右隣のリーフノードのページ番号を保持する。最も右のリーフノードは`next_leaf`の値が0になる（ページ0はテーブルのルートノード用に予約されている）。

リーフノードヘッダのフォーマットを新しいフィールドを含むよう更新する：

```diff
 const uint32_t LEAF_NODE_NUM_CELLS_SIZE = sizeof(uint32_t);
 const uint32_t LEAF_NODE_NUM_CELLS_OFFSET = COMMON_NODE_HEADER_SIZE;
-const uint32_t LEAF_NODE_HEADER_SIZE =
-    COMMON_NODE_HEADER_SIZE + LEAF_NODE_NUM_CELLS_SIZE;
+const uint32_t LEAF_NODE_NEXT_LEAF_SIZE = sizeof(uint32_t);
+const uint32_t LEAF_NODE_NEXT_LEAF_OFFSET =
+    LEAF_NODE_NUM_CELLS_OFFSET + LEAF_NODE_NUM_CELLS_SIZE;
+const uint32_t LEAF_NODE_HEADER_SIZE = COMMON_NODE_HEADER_SIZE +
+                                       LEAF_NODE_NUM_CELLS_SIZE +
+                                       LEAF_NODE_NEXT_LEAF_SIZE;

 ```

新しいフィールドにアクセスするメソッドを追加する：
```diff
+uint32_t* leaf_node_next_leaf(void* node) {
+  return node + LEAF_NODE_NEXT_LEAF_OFFSET;
+}
```

新しいリーフノードを初期化する時、デフォルトで`next_leaf`を0にする：

```diff
@@ -322,6 +330,7 @@ void initialize_leaf_node(void* node) {
   set_node_type(node, NODE_LEAF);
   set_node_root(node, false);
   *leaf_node_num_cells(node) = 0;
+  *leaf_node_next_leaf(node) = 0;  // 0は兄弟がいないことを意味する
 }
```

リーフノードを分割する際に、兄弟ポインタを更新する。旧リーフの兄弟が新リーフになり、新リーフの兄弟は旧リーフの以前の兄弟になる。

```diff
@@ -659,6 +671,8 @@ void leaf_node_split_and_insert(Cursor* cursor, uint32_t key, Row* value) {
   uint32_t new_page_num = get_unused_page_num(cursor->table->pager);
   void* new_node = get_page(cursor->table->pager, new_page_num);
   initialize_leaf_node(new_node);
+  *leaf_node_next_leaf(new_node) = *leaf_node_next_leaf(old_node);
+  *leaf_node_next_leaf(old_node) = new_page_num;
```

新しいフィールドの追加でいくつかの定数が変わる：
```diff
   it 'prints constants' do
     script = [
       ".constants",
@@ -199,9 +228,9 @@ describe 'database' do
       "db > Constants:",
       "ROW_SIZE: 293",
       "COMMON_NODE_HEADER_SIZE: 6",
-      "LEAF_NODE_HEADER_SIZE: 10",
+      "LEAF_NODE_HEADER_SIZE: 14",
       "LEAF_NODE_CELL_SIZE: 297",
-      "LEAF_NODE_SPACE_FOR_CELLS: 4086",
+      "LEAF_NODE_SPACE_FOR_CELLS: 4082",
       "LEAF_NODE_MAX_CELLS: 13",
       "db > ",
     ])
```

リーフノードの末尾を超えてカーソルを進めたい時、リーフノードに兄弟がいるか確認する。いれば、そこにジャンプする。いなければ、テーブルの末尾に到達したことになる。

```diff
@@ -428,7 +432,15 @@ void cursor_advance(Cursor* cursor) {

   cursor->cell_num += 1;
   if (cursor->cell_num >= (*leaf_node_num_cells(node))) {
-    cursor->end_of_table = true;
+    /* 次のリーフノードに進む */
+    uint32_t next_page_num = *leaf_node_next_leaf(node);
+    if (next_page_num == 0) {
+      /* 最も右のリーフだった */
+      cursor->end_of_table = true;
+    } else {
+      cursor->page_num = next_page_num;
+      cursor->cell_num = 0;
+    }
   }
 }
```

これらの変更を加えると、15行が表示されるようになるが...
```
db > select
(1, user1, person1@example.com)
(2, user2, person2@example.com)
(3, user3, person3@example.com)
(4, user4, person4@example.com)
(5, user5, person5@example.com)
(6, user6, person6@example.com)
(7, user7, person7@example.com)
(8, user8, person8@example.com)
(9, user9, person9@example.com)
(10, user10, person10@example.com)
(11, user11, person11@example.com)
(12, user12, person12@example.com)
(13, user13, person13@example.com)
(1919251317, 14, on14@example.com)
(15, user15, person15@example.com)
Executed.
db >
```

...1つのデータが壊れている
```
(1919251317, 14, on14@example.com)
```

デバッグの結果、リーフノード分割時のバグが原因だと判明した：

```diff
@@ -676,7 +690,9 @@ void leaf_node_split_and_insert(Cursor* cursor, uint32_t key, Row* value) {
     void* destination = leaf_node_cell(destination_node, index_within_node);

     if (i == cursor->cell_num) {
-      serialize_row(value, destination);
+      serialize_row(value,
+                    leaf_node_value(destination_node, index_within_node));
+      *leaf_node_key(destination_node, index_within_node) = key;
     } else if (i > cursor->cell_num) {
       memcpy(destination, leaf_node_cell(old_node, i - 1), LEAF_NODE_CELL_SIZE);
     } else {
```

リーフノードの各セルは、まずキー、次に値で構成されていることを思い出してほしい：

{% include image.html url="assets/images/leaf-node-format.png" description="元のリーフノードフォーマット" %}

新しい行（値）をセルの先頭（キーがあるべき場所）に書き込んでいた。つまりユーザー名の一部がid用のセクションに入り込んでいたのだ（だからidが異常に大きい値になっていた）。

このバグを修正すると、ようやくテーブル全体が正しく表示されるようになった：

```
db > select
(1, user1, person1@example.com)
(2, user2, person2@example.com)
(3, user3, person3@example.com)
(4, user4, person4@example.com)
(5, user5, person5@example.com)
(6, user6, person6@example.com)
(7, user7, person7@example.com)
(8, user8, person8@example.com)
(9, user9, person9@example.com)
(10, user10, person10@example.com)
(11, user11, person11@example.com)
(12, user12, person12@example.com)
(13, user13, person13@example.com)
(14, user14, person14@example.com)
(15, user15, person15@example.com)
Executed.
db >
```

ふう！バグの連続だが、着実に前進している。

それではまた次回。
