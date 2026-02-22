---
title: Part 11 - B-Treeの再帰的検索
date: 2017-10-22
---

> 🎯 **このパートを学ぶ理由**: 複数階層のツリーを再帰的に検索するアルゴリズム。内部ノードを辞ってリーフノードにたどり着く過程を実装する。
> **前提知識**: Part 10（リーフノードの分割）

前回は15行目を挿入しようとしてエラーで終わった：

```
db > insert 15 user15 person15@example.com
Need to implement searching an internal node
```

まず、スタブコードを新しい関数呼び出しに置き換える。

```diff
   if (get_node_type(root_node) == NODE_LEAF) {
     return leaf_node_find(table, root_page_num, key);
   } else {
-    printf("Need to implement searching an internal node\n");
-    exit(EXIT_FAILURE);
+    return internal_node_find(table, root_page_num, key);
   }
 }
```

この関数は、指定されたキーを含むべき子を見つけるために二分探索を行う。各子ポインタの右にあるキーは、その子に含まれる最大キーであることを思い出してほしい。

{% include image.html url="assets/images/btree6.png" description="3階層のbtree" %}

二分探索では、検索するキーと子ポインタの右にあるキーを比較する：

```diff
+Cursor* internal_node_find(Table* table, uint32_t page_num, uint32_t key) {
+  void* node = get_page(table->pager, page_num);
+  uint32_t num_keys = *internal_node_num_keys(node);
+
+  /* 検索すべき子のインデックスを二分探索で見つける */
+  uint32_t min_index = 0;
+  uint32_t max_index = num_keys; /* キーより1つ多い子がある */
+
+  while (min_index != max_index) {
+    uint32_t index = (min_index + max_index) / 2;
+    uint32_t key_to_right = *internal_node_key(node, index);
+    if (key_to_right >= key) {
+      max_index = index;
+    } else {
+      min_index = index + 1;
+    }
+  }
```

内部ノードの子はリーフノードにも、さらに内部ノードにもなり得ることを思い出してほしい。正しい子を見つけた後、適切な検索関数を呼び出す：

```diff
+  uint32_t child_num = *internal_node_child(node, min_index);
+  void* child = get_page(table->pager, child_num);
+  switch (get_node_type(child)) {
+    case NODE_LEAF:
+      return leaf_node_find(table, child_num, key);
+    case NODE_INTERNAL:
+      return internal_node_find(table, child_num, key);
+  }
+}
```

# テスト

複数ノードのbtreeへのキー挿入がエラーにならなくなった。テストを更新できる：

```diff
       "    - 12",
       "    - 13",
       "    - 14",
-      "db > Need to implement searching an internal node",
+      "db > Executed.",
+      "db > ",
     ])
   end
```

もう1つのテストも見直す時が来たと思う。1400行を挿入するテストだ。まだエラーになるが、エラーメッセージが新しくなった。現時点ではプログラムがクラッシュした場合のテストの扱いがうまくない。クラッシュした場合は、それまでに得られた出力をそのまま使うことにする：

```diff
     raw_output = nil
     IO.popen("./db test.db", "r+") do |pipe|
       commands.each do |command|
-        pipe.puts command
+        begin
+          pipe.puts command
+        rescue Errno::EPIPE
+          break
+        end
       end

       pipe.close_write
```

すると、1400行テストが以下のエラーを出力することが分かる：

```diff
     end
     script << ".exit"
     result = run_script(script)
-    expect(result[-2]).to eq('db > Error: Table full.')
+    expect(result.last(2)).to match_array([
+      "db > Executed.",
+      "db > Need to implement updating parent after split",
+    ])
   end
```

次のTODO項目は決まったようだ！

---

<div align="center">

[← 前へ: Part 10 - リーフノードの分割](./part10.md) | [次へ: Part 12 - 複数階層のスキャン →](./part12.md)

</div>
