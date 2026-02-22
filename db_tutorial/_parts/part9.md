---
title: Part 9 - 二分探索と重複キー
date: 2017-10-01
---

> 🎯 **このパートを学ぶ理由**: ソート済みデータに対する二分探索の実装と重複キーの検出。O(n)の線形探索からO(log n)の二分探索への進化を体験する。
> **前提知識**: Part 8（リーフノードのレイアウト）

前回、キーがまだソートされていない順序で保存されていることに気づいた。この問題を修正し、さらに重複キーを検出して拒否するようにする。

現在の`execute_insert()`関数は常にテーブルの末尾に挿入している。代わりに、テーブル内の正しい挿入位置を検索し、そこに挿入すべきだ。キーが既に存在する場合はエラーを返す。

```diff
ExecuteResult execute_insert(Statement* statement, Table* table) {
   void* node = get_page(table->pager, table->root_page_num);
-  if ((*leaf_node_num_cells(node) >= LEAF_NODE_MAX_CELLS)) {
+  uint32_t num_cells = (*leaf_node_num_cells(node));
+  if (num_cells >= LEAF_NODE_MAX_CELLS) {
     return EXECUTE_TABLE_FULL;
   }

   Row* row_to_insert = &(statement->row_to_insert);
-  Cursor* cursor = table_end(table);
+  uint32_t key_to_insert = row_to_insert->id;
+  Cursor* cursor = table_find(table, key_to_insert);
+
+  if (cursor->cell_num < num_cells) {
+    uint32_t key_at_index = *leaf_node_key(node, cursor->cell_num);
+    if (key_at_index == key_to_insert) {
+      return EXECUTE_DUPLICATE_KEY;
+    }
+  }

   leaf_node_insert(cursor, row_to_insert->id, row_to_insert);
```

`table_end()`関数はもう不要だ。

```diff
-Cursor* table_end(Table* table) {
-  Cursor* cursor = malloc(sizeof(Cursor));
-  cursor->table = table;
-  cursor->page_num = table->root_page_num;
-
-  void* root_node = get_page(table->pager, table->root_page_num);
-  uint32_t num_cells = *leaf_node_num_cells(root_node);
-  cursor->cell_num = num_cells;
-  cursor->end_of_table = true;
-
-  return cursor;
-}
```

代わりに、指定されたキーでツリーを検索するメソッドに置き換える。

```diff
+/*
+指定されたキーの位置を返す。
+キーが存在しない場合は、挿入すべき位置を返す
+*/
+Cursor* table_find(Table* table, uint32_t key) {
+  uint32_t root_page_num = table->root_page_num;
+  void* root_node = get_page(table->pager, root_page_num);
+
+  if (get_node_type(root_node) == NODE_LEAF) {
+    return leaf_node_find(table, root_page_num, key);
+  } else {
+    printf("Need to implement searching an internal node\n");
+    exit(EXIT_FAILURE);
+  }
+}
```

内部ノードはまだ実装していないので、そちらの分岐はスタブにしておく。リーフノードは二分探索で検索できる。

```diff
+Cursor* leaf_node_find(Table* table, uint32_t page_num, uint32_t key) {
+  void* node = get_page(table->pager, page_num);
+  uint32_t num_cells = *leaf_node_num_cells(node);
+
+  Cursor* cursor = malloc(sizeof(Cursor));
+  cursor->table = table;
+  cursor->page_num = page_num;
+
+  // 二分探索
+  uint32_t min_index = 0;
+  uint32_t one_past_max_index = num_cells;
+  while (one_past_max_index != min_index) {
+    uint32_t index = (min_index + one_past_max_index) / 2;
+    uint32_t key_at_index = *leaf_node_key(node, index);
+    if (key == key_at_index) {
+      cursor->cell_num = index;
+      return cursor;
+    }
+    if (key < key_at_index) {
+      one_past_max_index = index;
+    } else {
+      min_index = index + 1;
+    }
+  }
+
+  cursor->cell_num = min_index;
+  return cursor;
+}
```

この関数は以下のいずれかを返す：
- キーの位置
- 新しいキーを挿入するために移動が必要な別のキーの位置
- 最後のキーの1つ先の位置

ノードタイプをチェックするようになったので、ノードのタイプ値を取得・設定する関数が必要だ。

```diff
+NodeType get_node_type(void* node) {
+  uint8_t value = *((uint8_t*)(node + NODE_TYPE_OFFSET));
+  return (NodeType)value;
+}
+
+void set_node_type(void* node, NodeType type) {
+  uint8_t value = type;
+  *((uint8_t*)(node + NODE_TYPE_OFFSET)) = value;
+}
```

1バイトとしてシリアライズされることを保証するために、まず`uint8_t`にキャストする必要がある。

ノードタイプの初期化も必要だ。

```diff
-void initialize_leaf_node(void* node) { *leaf_node_num_cells(node) = 0; }
+void initialize_leaf_node(void* node) {
+  set_node_type(node, NODE_LEAF);
+  *leaf_node_num_cells(node) = 0;
+}
```

最後に、新しいエラーコードを作成して処理する。

```diff
-enum ExecuteResult_t { EXECUTE_SUCCESS, EXECUTE_TABLE_FULL };
+enum ExecuteResult_t {
+  EXECUTE_SUCCESS,
+  EXECUTE_DUPLICATE_KEY,
+  EXECUTE_TABLE_FULL
+};
```

```diff
       case (EXECUTE_SUCCESS):
         printf("Executed.\n");
         break;
+      case (EXECUTE_DUPLICATE_KEY):
+        printf("Error: Duplicate key.\n");
+        break;
       case (EXECUTE_TABLE_FULL):
         printf("Error: Table full.\n");
         break;
```

これらの変更で、テストをソート順を検証するよう変更できる：

```diff
       "db > Executed.",
       "db > Tree:",
       "leaf (size 3)",
-      "  - 0 : 3",
-      "  - 1 : 1",
-      "  - 2 : 2",
+      "  - 0 : 1",
+      "  - 1 : 2",
+      "  - 2 : 3",
       "db > "
     ])
   end
```

重複キーのテストも追加できる：

```diff
+  it 'prints an error message if there is a duplicate id' do
+    script = [
+      "insert 1 user1 person1@example.com",
+      "insert 1 user1 person1@example.com",
+      "select",
+      ".exit",
+    ]
+    result = run_script(script)
+    expect(result).to match_array([
+      "db > Executed.",
+      "db > Error: Duplicate key.",
+      "db > (1, user1, person1@example.com)",
+      "Executed.",
+      "db > ",
+    ])
+  end
```

以上だ！次はリーフノードの分割と内部ノードの作成を実装する。

---

<div align="center">

[← 前へ: Part 8 - リーフノード](./part8.md) | [次へ: Part 10 - リーフノードの分割 →](./part10.md)

</div>
