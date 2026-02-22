---
title: Part 8 - B-Treeリーフノードのフォーマット
date: 2017-09-25
---

> 🎯 **このパートを学ぶ理由**: B-Treeの物理レイアウトを設計する。「各ノードが1ページに対応」という制約の下でヘッダ・セルのメモリ配置を決める。データ構造の「バイトレベルでの設計」を体験する。
> **前提知識**: Part 7（B-Treeの理論）

テーブルのフォーマットを、ソートされていない行の配列からB-Treeに変更する。これはかなり大きな変更で、複数回の記事にわたって実装する。この記事の最後には、リーフノードのレイアウトを定義し、単一ノードのツリーへのキー/値ペアの挿入をサポートする。だがまず、ツリー構造に切り替える理由をおさらいしよう。

## テーブルフォーマットの選択肢

現在のフォーマットでは、各ページは行のみを保存し（メタデータなし）、空間効率が良い。挿入も末尾に追加するだけなので高速だ。しかし、特定の行を見つけるにはテーブル全体をスキャンするしかない。また、行を削除したい場合は、その後のすべての行を移動して穴を埋める必要がある。

テーブルを配列として保存しつつ、IDでソートされた状態を維持すれば、二分探索で特定のIDを見つけられる。しかし、挿入時に多くの行を移動してスペースを空ける必要があり、遅くなる。

代わりに、ツリー構造を採用する。ツリーの各ノードは可変数の行を保持できるため、各ノードに何行含まれているかを追跡する情報を保存する必要がある。さらに、行を保存しない内部ノードのストレージオーバーヘッドもある。データベースファイルが大きくなる代わりに、高速な挿入・削除・検索が得られる。

|               | ソートされていない行の配列 | ソートされた行の配列 | ノードのツリー |
|---------------|---------------------------|----------------------|----------------|
| ページの中身  | データのみ                 | データのみ            | メタデータ、主キー、データ |
| ページあたりの行数 | 多い                   | 多い                  | 少ない         |
| 挿入          | O(1)                      | O(n)                  | O(log(n))     |
| 削除          | O(n)                      | O(n)                  | O(log(n))     |
| IDによる検索  | O(n)                      | O(log(n))             | O(log(n))     |

## ノードヘッダのフォーマット

リーフノードと内部ノードは異なるレイアウトを持つ。ノードタイプを追跡するenumを作る：

```diff
+typedef enum { NODE_INTERNAL, NODE_LEAF } NodeType;
```

各ノードは1つのページに対応する。内部ノードは子ノードが格納されているページ番号を保持することで子を指す。btreeはページャに特定のページ番号を要求し、ページキャッシュへのポインタを受け取る。ページはページ番号順にデータベースファイルに保存される。

ノードはページ先頭のヘッダにメタデータを保存する必要がある。すべてのノードは、ノードの種類、ルートノードかどうか、親へのポインタ（兄弟ノードを見つけるため）を保存する。各ヘッダフィールドのサイズとオフセットの定数を定義する：

```diff
+/*
+ * 共通ノードヘッダレイアウト
+ */
+const uint32_t NODE_TYPE_SIZE = sizeof(uint8_t);
+const uint32_t NODE_TYPE_OFFSET = 0;
+const uint32_t IS_ROOT_SIZE = sizeof(uint8_t);
+const uint32_t IS_ROOT_OFFSET = NODE_TYPE_SIZE;
+const uint32_t PARENT_POINTER_SIZE = sizeof(uint32_t);
+const uint32_t PARENT_POINTER_OFFSET = IS_ROOT_OFFSET + IS_ROOT_SIZE;
+const uint8_t COMMON_NODE_HEADER_SIZE =
+    NODE_TYPE_SIZE + IS_ROOT_SIZE + PARENT_POINTER_SIZE;
```

## リーフノードのフォーマット

共通ヘッダフィールドに加えて、リーフノードは「セル」の数を保存する必要がある。セルはキー/値ペアのことだ。

```diff
+/*
+ * リーフノードヘッダレイアウト
+ */
+const uint32_t LEAF_NODE_NUM_CELLS_SIZE = sizeof(uint32_t);
+const uint32_t LEAF_NODE_NUM_CELLS_OFFSET = COMMON_NODE_HEADER_SIZE;
+const uint32_t LEAF_NODE_HEADER_SIZE =
+    COMMON_NODE_HEADER_SIZE + LEAF_NODE_NUM_CELLS_SIZE;
```

リーフノードの本体はセルの配列だ。各セルはキーの後に値（シリアライズされた行）が続く。

```diff
+/*
+ * リーフノードボディレイアウト
+ */
+const uint32_t LEAF_NODE_KEY_SIZE = sizeof(uint32_t);
+const uint32_t LEAF_NODE_KEY_OFFSET = 0;
+const uint32_t LEAF_NODE_VALUE_SIZE = ROW_SIZE;
+const uint32_t LEAF_NODE_VALUE_OFFSET =
+    LEAF_NODE_KEY_OFFSET + LEAF_NODE_KEY_SIZE;
+const uint32_t LEAF_NODE_CELL_SIZE = LEAF_NODE_KEY_SIZE + LEAF_NODE_VALUE_SIZE;
+const uint32_t LEAF_NODE_SPACE_FOR_CELLS = PAGE_SIZE - LEAF_NODE_HEADER_SIZE;
+const uint32_t LEAF_NODE_MAX_CELLS =
+    LEAF_NODE_SPACE_FOR_CELLS / LEAF_NODE_CELL_SIZE;
```

これらの定数に基づくと、リーフノードのレイアウトは現在こうなっている：

{% include image.html url="assets/images/leaf-node-format.png" description="リーフノードのフォーマット" %}

ヘッダのブーリアン値にバイト全体を使うのは少し空間効率が悪いが、それらの値にアクセスするコードが書きやすくなる。

末尾に未使用のスペースがあることにも注目してほしい。ヘッダの後にできるだけ多くのセルを格納するが、余ったスペースにはセル全体が入らない。ノード間でセルを分割することを避けるために、そのまま空にしておく。

## リーフノードフィールドへのアクセス

キー、値、メタデータにアクセスするコードはすべて、先ほど定義した定数を使ったポインタ演算を伴う。

```diff
+uint32_t* leaf_node_num_cells(void* node) {
+  return node + LEAF_NODE_NUM_CELLS_OFFSET;
+}
+
+void* leaf_node_cell(void* node, uint32_t cell_num) {
+  return node + LEAF_NODE_HEADER_SIZE + cell_num * LEAF_NODE_CELL_SIZE;
+}
+
+uint32_t* leaf_node_key(void* node, uint32_t cell_num) {
+  return leaf_node_cell(node, cell_num);
+}
+
+void* leaf_node_value(void* node, uint32_t cell_num) {
+  return leaf_node_cell(node, cell_num) + LEAF_NODE_KEY_SIZE;
+}
+
+void initialize_leaf_node(void* node) { *leaf_node_num_cells(node) = 0; }
+
```

これらのメソッドは対象の値へのポインタを返すため、ゲッターとしてもセッターとしても使える。

## PagerとTableオブジェクトの変更

各ノードはたとえ満杯でなくてもちょうど1ページを占める。そのため、ページャは不完全なページの読み書きをサポートする必要がなくなる。
```diff
-void pager_flush(Pager* pager, uint32_t page_num, uint32_t size) {
+void pager_flush(Pager* pager, uint32_t page_num) {
   if (pager->pages[page_num] == NULL) {
     printf("Tried to flush null page\n");
     exit(EXIT_FAILURE);
@@ -242,7 +337,7 @@ void pager_flush(Pager* pager, uint32_t page_num, uint32_t size) {
   }

   ssize_t bytes_written =
-      write(pager->file_descriptor, pager->pages[page_num], size);
+      write(pager->file_descriptor, pager->pages[page_num], PAGE_SIZE);

   if (bytes_written == -1) {
     printf("Error writing: %d\n", errno);
```

```diff
 void db_close(Table* table) {
   Pager* pager = table->pager;
-  uint32_t num_full_pages = table->num_rows / ROWS_PER_PAGE;

-  for (uint32_t i = 0; i < num_full_pages; i++) {
+  for (uint32_t i = 0; i < pager->num_pages; i++) {
     if (pager->pages[i] == NULL) {
       continue;
     }
-    pager_flush(pager, i, PAGE_SIZE);
+    pager_flush(pager, i);
     free(pager->pages[i]);
     pager->pages[i] = NULL;
   }

-  // ファイル末尾に書き込むべき不完全なページがある場合がある
-  // B-treeに切り替えた後は不要になる
-  uint32_t num_additional_rows = table->num_rows % ROWS_PER_PAGE;
-  if (num_additional_rows > 0) {
-    uint32_t page_num = num_full_pages;
-    if (pager->pages[page_num] != NULL) {
-      pager_flush(pager, page_num, num_additional_rows * ROW_SIZE);
-      free(pager->pages[page_num]);
-      pager->pages[page_num] = NULL;
-    }
-  }
-
   int result = close(pager->file_descriptor);
   if (result == -1) {
     printf("Error closing db file.\n");
```

これで、行数ではなくデータベースのページ数を保存する方が理にかなう。ページ数はテーブルではなくページャオブジェクトに関連付けるべきだ。データベースが使用するページ数であって、特定のテーブルのものではないからだ。btreeはルートノードのページ番号で識別されるため、テーブルオブジェクトはそれを追跡する必要がある。

```diff
 const uint32_t PAGE_SIZE = 4096;
 const uint32_t TABLE_MAX_PAGES = 100;
-const uint32_t ROWS_PER_PAGE = PAGE_SIZE / ROW_SIZE;
-const uint32_t TABLE_MAX_ROWS = ROWS_PER_PAGE * TABLE_MAX_PAGES;

 typedef struct {
   int file_descriptor;
   uint32_t file_length;
+  uint32_t num_pages;
   void* pages[TABLE_MAX_PAGES];
 } Pager;

 typedef struct {
   Pager* pager;
-  uint32_t num_rows;
+  uint32_t root_page_num;
 } Table;
```

```diff
@@ -127,6 +200,10 @@ void* get_page(Pager* pager, uint32_t page_num) {
     }

     pager->pages[page_num] = page;
+
+    if (page_num >= pager->num_pages) {
+      pager->num_pages = page_num + 1;
+    }
   }

   return pager->pages[page_num];
```

```diff
@@ -184,6 +269,12 @@ Pager* pager_open(const char* filename) {
   Pager* pager = malloc(sizeof(Pager));
   pager->file_descriptor = fd;
   pager->file_length = file_length;
+  pager->num_pages = (file_length / PAGE_SIZE);
+
+  if (file_length % PAGE_SIZE != 0) {
+    printf("Db file is not a whole number of pages. Corrupt file.\n");
+    exit(EXIT_FAILURE);
+  }

   for (uint32_t i = 0; i < TABLE_MAX_PAGES; i++) {
     pager->pages[i] = NULL;
```

## Cursorオブジェクトの変更

カーソルはテーブル内の位置を表す。テーブルが単純な行の配列だった時は、行番号だけで行にアクセスできた。ツリーになった今は、ノードのページ番号とそのノード内のセル番号で位置を識別する。

```diff
 typedef struct {
   Table* table;
-  uint32_t row_num;
+  uint32_t page_num;
+  uint32_t cell_num;
   bool end_of_table;  // 最後の要素の1つ先の位置を示す
 } Cursor;
```

```diff
 Cursor* table_start(Table* table) {
   Cursor* cursor = malloc(sizeof(Cursor));
   cursor->table = table;
-  cursor->row_num = 0;
-  cursor->end_of_table = (table->num_rows == 0);
+  cursor->page_num = table->root_page_num;
+  cursor->cell_num = 0;
+
+  void* root_node = get_page(table->pager, table->root_page_num);
+  uint32_t num_cells = *leaf_node_num_cells(root_node);
+  cursor->end_of_table = (num_cells == 0);

   return cursor;
 }
```

```diff
 Cursor* table_end(Table* table) {
   Cursor* cursor = malloc(sizeof(Cursor));
   cursor->table = table;
-  cursor->row_num = table->num_rows;
+  cursor->page_num = table->root_page_num;
+
+  void* root_node = get_page(table->pager, table->root_page_num);
+  uint32_t num_cells = *leaf_node_num_cells(root_node);
+  cursor->cell_num = num_cells;
   cursor->end_of_table = true;

   return cursor;
 }
```

```diff
 void* cursor_value(Cursor* cursor) {
-  uint32_t row_num = cursor->row_num;
-  uint32_t page_num = row_num / ROWS_PER_PAGE;
+  uint32_t page_num = cursor->page_num;
   void* page = get_page(cursor->table->pager, page_num);
-  uint32_t row_offset = row_num % ROWS_PER_PAGE;
-  uint32_t byte_offset = row_offset * ROW_SIZE;
-  return page + byte_offset;
+  return leaf_node_value(page, cursor->cell_num);
 }
```

```diff
 void cursor_advance(Cursor* cursor) {
-  cursor->row_num += 1;
-  if (cursor->row_num >= cursor->table->num_rows) {
+  uint32_t page_num = cursor->page_num;
+  void* node = get_page(cursor->table->pager, page_num);
+
+  cursor->cell_num += 1;
+  if (cursor->cell_num >= (*leaf_node_num_cells(node))) {
     cursor->end_of_table = true;
   }
 }
```

## リーフノードへの挿入

この記事では、単一ノードのツリーを動かすのに十分なだけ実装する。前回の記事を思い出すと、ツリーは空のリーフノードから始まる：

{% include image.html url="assets/images/btree1.png" description="空のbtree" %}

リーフノードがいっぱいになるまでキー/値ペアを追加できる：

{% include image.html url="assets/images/btree2.png" description="1ノードのbtree" %}

データベースを初めて開く時、データベースファイルは空なので、ページ0を空のリーフノード（ルートノード）として初期化する：

```diff
 Table* db_open(const char* filename) {
   Pager* pager = pager_open(filename);
-  uint32_t num_rows = pager->file_length / ROW_SIZE;

   Table* table = malloc(sizeof(Table));
   table->pager = pager;
-  table->num_rows = num_rows;
+  table->root_page_num = 0;
+
+  if (pager->num_pages == 0) {
+    // 新しいデータベースファイル。ページ0をリーフノードとして初期化。
+    void* root_node = get_page(pager, 0);
+    initialize_leaf_node(root_node);
+  }

   return table;
 }
```

次に、リーフノードにキー/値ペアを挿入する関数を作る。挿入すべき位置を表すカーソルを入力として受け取る。

```diff
+void leaf_node_insert(Cursor* cursor, uint32_t key, Row* value) {
+  void* node = get_page(cursor->table->pager, cursor->page_num);
+
+  uint32_t num_cells = *leaf_node_num_cells(node);
+  if (num_cells >= LEAF_NODE_MAX_CELLS) {
+    // ノードがいっぱい
+    printf("Need to implement splitting a leaf node.\n");
+    exit(EXIT_FAILURE);
+  }
+
+  if (cursor->cell_num < num_cells) {
+    // 新しいセルのためにスペースを空ける
+    for (uint32_t i = num_cells; i > cursor->cell_num; i--) {
+      memcpy(leaf_node_cell(node, i), leaf_node_cell(node, i - 1),
+             LEAF_NODE_CELL_SIZE);
+    }
+  }
+
+  *(leaf_node_num_cells(node)) += 1;
+  *(leaf_node_key(node, cursor->cell_num)) = key;
+  serialize_row(value, leaf_node_value(node, cursor->cell_num));
+}
+
```

分割はまだ実装していないので、ノードがいっぱいの場合はエラーにする。次に、新しいセルのためにスペースを空けるよう既存のセルを1つ右にずらす。そして空いたスペースに新しいキー/値を書き込む。

ツリーが1ノードしかないという前提なので、`execute_insert()`関数はこのヘルパーメソッドを呼び出すだけでよい：

```diff
 ExecuteResult execute_insert(Statement* statement, Table* table) {
-  if (table->num_rows >= TABLE_MAX_ROWS) {
+  void* node = get_page(table->pager, table->root_page_num);
+  if ((*leaf_node_num_cells(node) >= LEAF_NODE_MAX_CELLS)) {
     return EXECUTE_TABLE_FULL;
   }

   Row* row_to_insert = &(statement->row_to_insert);
   Cursor* cursor = table_end(table);

-  serialize_row(row_to_insert, cursor_value(cursor));
-  table->num_rows += 1;
+  leaf_node_insert(cursor, row_to_insert->id, row_to_insert);

   free(cursor);
```

これらの変更で、データベースは以前と同様に動作するはずだ！ただし、ルートノードの分割がまだできないので、「Table Full」エラーがずっと早く出る。

リーフノードには何行入るのだろうか？

## 定数を表示するコマンド

いくつかの重要な定数を表示するメタコマンドを追加する。

```diff
+void print_constants() {
+  printf("ROW_SIZE: %d\n", ROW_SIZE);
+  printf("COMMON_NODE_HEADER_SIZE: %d\n", COMMON_NODE_HEADER_SIZE);
+  printf("LEAF_NODE_HEADER_SIZE: %d\n", LEAF_NODE_HEADER_SIZE);
+  printf("LEAF_NODE_CELL_SIZE: %d\n", LEAF_NODE_CELL_SIZE);
+  printf("LEAF_NODE_SPACE_FOR_CELLS: %d\n", LEAF_NODE_SPACE_FOR_CELLS);
+  printf("LEAF_NODE_MAX_CELLS: %d\n", LEAF_NODE_MAX_CELLS);
+}
+
@@ -294,6 +376,14 @@ MetaCommandResult do_meta_command(InputBuffer* input_buffer, Table* table) {
   if (strcmp(input_buffer->buffer, ".exit") == 0) {
     db_close(table);
     exit(EXIT_SUCCESS);
+  } else if (strcmp(input_buffer->buffer, ".constants") == 0) {
+    printf("Constants:\n");
+    print_constants();
+    return META_COMMAND_SUCCESS;
   } else {
     return META_COMMAND_UNRECOGNIZED_COMMAND;
   }
```

定数が変わった時にアラートが出るようテストも追加する：
```diff
+  it 'prints constants' do
+    script = [
+      ".constants",
+      ".exit",
+    ]
+    result = run_script(script)
+
+    expect(result).to match_array([
+      "db > Constants:",
+      "ROW_SIZE: 293",
+      "COMMON_NODE_HEADER_SIZE: 6",
+      "LEAF_NODE_HEADER_SIZE: 10",
+      "LEAF_NODE_CELL_SIZE: 297",
+      "LEAF_NODE_SPACE_FOR_CELLS: 4086",
+      "LEAF_NODE_MAX_CELLS: 13",
+      "db > ",
+    ])
+  end
```

現時点でテーブルは13行保持できる！

## ツリーの可視化

デバッグと可視化に役立てるため、btreeの表現を出力するメタコマンドも追加する。

```diff
+void print_leaf_node(void* node) {
+  uint32_t num_cells = *leaf_node_num_cells(node);
+  printf("leaf (size %d)\n", num_cells);
+  for (uint32_t i = 0; i < num_cells; i++) {
+    uint32_t key = *leaf_node_key(node, i);
+    printf("  - %d : %d\n", i, key);
+  }
+}
+
```

```diff
@@ -294,6 +376,14 @@ MetaCommandResult do_meta_command(InputBuffer* input_buffer, Table* table) {
   if (strcmp(input_buffer->buffer, ".exit") == 0) {
     db_close(table);
     exit(EXIT_SUCCESS);
+  } else if (strcmp(input_buffer->buffer, ".btree") == 0) {
+    printf("Tree:\n");
+    print_leaf_node(get_page(table->pager, 0));
+    return META_COMMAND_SUCCESS;
   } else if (strcmp(input_buffer->buffer, ".constants") == 0) {
     printf("Constants:\n");
     print_constants();
     return META_COMMAND_SUCCESS;
   } else {
     return META_COMMAND_UNRECOGNIZED_COMMAND;
   }
```

テストも追加：

```diff
+  it 'allows printing out the structure of a one-node btree' do
+    script = [3, 1, 2].map do |i|
+      "insert #{i} user#{i} person#{i}@example.com"
+    end
+    script << ".btree"
+    script << ".exit"
+    result = run_script(script)
+
+    expect(result).to match_array([
+      "db > Executed.",
+      "db > Executed.",
+      "db > Executed.",
+      "db > Tree:",
+      "leaf (size 3)",
+      "  - 0 : 3",
+      "  - 1 : 1",
+      "  - 2 : 2",
+      "db > "
+    ])
+  end
```

おっと、行がソート順で保存されていない。`execute_insert()`は`table_end()`が返す位置に挿入しているのに気づくだろう。つまり、行は以前と同じく挿入された順番で保存されている。

## 次回

ここまでは後退のように感じるかもしれない。データベースは以前より少ない行しか保存できず、行はまだソートされていない順序で保存されている。しかし冒頭で述べたように、これは大きな変更であり、管理可能なステップに分解することが重要だ。

次回は、主キーによるレコード検索を実装し、行をソート順で保存し始める。

## 完全な差分

```diff
@@ -62,29 +62,101 @@ const uint32_t ROW_SIZE = ID_SIZE + USERNAME_SIZE + EMAIL_SIZE;

 const uint32_t PAGE_SIZE = 4096;
 #define TABLE_MAX_PAGES 100
-const uint32_t ROWS_PER_PAGE = PAGE_SIZE / ROW_SIZE;
-const uint32_t TABLE_MAX_ROWS = ROWS_PER_PAGE * TABLE_MAX_PAGES;

 typedef struct {
   int file_descriptor;
   uint32_t file_length;
+  uint32_t num_pages;
   void* pages[TABLE_MAX_PAGES];
 } Pager;

 typedef struct {
   Pager* pager;
-  uint32_t num_rows;
+  uint32_t root_page_num;
 } Table;

 typedef struct {
   Table* table;
-  uint32_t row_num;
+  uint32_t page_num;
+  uint32_t cell_num;
   bool end_of_table;  // 最後の要素の1つ先の位置を示す
 } Cursor;

+typedef enum { NODE_INTERNAL, NODE_LEAF } NodeType;
+
+/*
+ * 共通ノードヘッダレイアウト
+ */
+const uint32_t NODE_TYPE_SIZE = sizeof(uint8_t);
+const uint32_t NODE_TYPE_OFFSET = 0;
+const uint32_t IS_ROOT_SIZE = sizeof(uint8_t);
+const uint32_t IS_ROOT_OFFSET = NODE_TYPE_SIZE;
+const uint32_t PARENT_POINTER_SIZE = sizeof(uint32_t);
+const uint32_t PARENT_POINTER_OFFSET = IS_ROOT_OFFSET + IS_ROOT_SIZE;
+const uint8_t COMMON_NODE_HEADER_SIZE =
+    NODE_TYPE_SIZE + IS_ROOT_SIZE + PARENT_POINTER_SIZE;
+
+/*
+ * リーフノードヘッダレイアウト
+ */
+const uint32_t LEAF_NODE_NUM_CELLS_SIZE = sizeof(uint32_t);
+const uint32_t LEAF_NODE_NUM_CELLS_OFFSET = COMMON_NODE_HEADER_SIZE;
+const uint32_t LEAF_NODE_HEADER_SIZE =
+    COMMON_NODE_HEADER_SIZE + LEAF_NODE_NUM_CELLS_SIZE;
+
+/*
+ * リーフノードボディレイアウト
+ */
+const uint32_t LEAF_NODE_KEY_SIZE = sizeof(uint32_t);
+const uint32_t LEAF_NODE_KEY_OFFSET = 0;
+const uint32_t LEAF_NODE_VALUE_SIZE = ROW_SIZE;
+const uint32_t LEAF_NODE_VALUE_OFFSET =
+    LEAF_NODE_KEY_OFFSET + LEAF_NODE_KEY_SIZE;
+const uint32_t LEAF_NODE_CELL_SIZE = LEAF_NODE_KEY_SIZE + LEAF_NODE_VALUE_SIZE;
+const uint32_t LEAF_NODE_SPACE_FOR_CELLS = PAGE_SIZE - LEAF_NODE_HEADER_SIZE;
+const uint32_t LEAF_NODE_MAX_CELLS =
+    LEAF_NODE_SPACE_FOR_CELLS / LEAF_NODE_CELL_SIZE;
+
+uint32_t* leaf_node_num_cells(void* node) {
+  return node + LEAF_NODE_NUM_CELLS_OFFSET;
+}
+
+void* leaf_node_cell(void* node, uint32_t cell_num) {
+  return node + LEAF_NODE_HEADER_SIZE + cell_num * LEAF_NODE_CELL_SIZE;
+}
+
+uint32_t* leaf_node_key(void* node, uint32_t cell_num) {
+  return leaf_node_cell(node, cell_num);
+}
+
+void* leaf_node_value(void* node, uint32_t cell_num) {
+  return leaf_node_cell(node, cell_num) + LEAF_NODE_KEY_SIZE;
+}
+
+void print_constants() {
+  printf("ROW_SIZE: %d\n", ROW_SIZE);
+  printf("COMMON_NODE_HEADER_SIZE: %d\n", COMMON_NODE_HEADER_SIZE);
+  printf("LEAF_NODE_HEADER_SIZE: %d\n", LEAF_NODE_HEADER_SIZE);
+  printf("LEAF_NODE_CELL_SIZE: %d\n", LEAF_NODE_CELL_SIZE);
+  printf("LEAF_NODE_SPACE_FOR_CELLS: %d\n", LEAF_NODE_SPACE_FOR_CELLS);
+  printf("LEAF_NODE_MAX_CELLS: %d\n", LEAF_NODE_MAX_CELLS);
+}
+
+void print_leaf_node(void* node) {
+  uint32_t num_cells = *leaf_node_num_cells(node);
+  printf("leaf (size %d)\n", num_cells);
+  for (uint32_t i = 0; i < num_cells; i++) {
+    uint32_t key = *leaf_node_key(node, i);
+    printf("  - %d : %d\n", i, key);
+  }
+}
+
 void print_row(Row* row) {
     printf("(%d, %s, %s)\n", row->id, row->username, row->email);
 }
@@ -101,6 +173,8 @@ void deserialize_row(void *source, Row* destination) {
     memcpy(&(destination->email), source + EMAIL_OFFSET, EMAIL_SIZE);
 }

+void initialize_leaf_node(void* node) { *leaf_node_num_cells(node) = 0; }
+
 void* get_page(Pager* pager, uint32_t page_num) {
   if (page_num > TABLE_MAX_PAGES) {
     printf("Tried to fetch page number out of bounds. %d > %d\n", page_num,
@@ -128,6 +202,10 @@ void* get_page(Pager* pager, uint32_t page_num) {
     }

     pager->pages[page_num] = page;
+
+    if (page_num >= pager->num_pages) {
+      pager->num_pages = page_num + 1;
+    }
   }

   return pager->pages[page_num];
@@ -136,8 +214,12 @@ void* get_page(Pager* pager, uint32_t page_num) {
 Cursor* table_start(Table* table) {
   Cursor* cursor = malloc(sizeof(Cursor));
   cursor->table = table;
-  cursor->row_num = 0;
-  cursor->end_of_table = (table->num_rows == 0);
+  cursor->page_num = table->root_page_num;
+  cursor->cell_num = 0;
+
+  void* root_node = get_page(table->pager, table->root_page_num);
+  uint32_t num_cells = *leaf_node_num_cells(root_node);
+  cursor->end_of_table = (num_cells == 0);

   return cursor;
 }
@@ -145,24 +227,28 @@ Cursor* table_start(Table* table) {
 Cursor* table_end(Table* table) {
   Cursor* cursor = malloc(sizeof(Cursor));
   cursor->table = table;
-  cursor->row_num = table->num_rows;
+  cursor->page_num = table->root_page_num;
+
+  void* root_node = get_page(table->pager, table->root_page_num);
+  uint32_t num_cells = *leaf_node_num_cells(root_node);
+  cursor->cell_num = num_cells;
   cursor->end_of_table = true;

   return cursor;
 }

 void* cursor_value(Cursor* cursor) {
-  uint32_t row_num = cursor->row_num;
-  uint32_t page_num = row_num / ROWS_PER_PAGE;
+  uint32_t page_num = cursor->page_num;
   void* page = get_page(cursor->table->pager, page_num);
-  uint32_t row_offset = row_num % ROWS_PER_PAGE;
-  uint32_t byte_offset = row_offset * ROW_SIZE;
-  return page + byte_offset;
+  return leaf_node_value(page, cursor->cell_num);
 }

 void cursor_advance(Cursor* cursor) {
-  cursor->row_num += 1;
-  if (cursor->row_num >= cursor->table->num_rows) {
+  uint32_t page_num = cursor->page_num;
+  void* node = get_page(cursor->table->pager, page_num);
+
+  cursor->cell_num += 1;
+  if (cursor->cell_num >= (*leaf_node_num_cells(node))) {
     cursor->end_of_table = true;
   }
 }
@@ -185,6 +271,12 @@ Pager* pager_open(const char* filename) {
   Pager* pager = malloc(sizeof(Pager));
   pager->file_descriptor = fd;
   pager->file_length = file_length;
+  pager->num_pages = (file_length / PAGE_SIZE);
+
+  if (file_length % PAGE_SIZE != 0) {
+    printf("Db file is not a whole number of pages. Corrupt file.\n");
+    exit(EXIT_FAILURE);
+  }

   for (uint32_t i = 0; i < TABLE_MAX_PAGES; i++) {
     pager->pages[i] = NULL;
@@ -194,11 +285,15 @@ Pager* pager_open(const char* filename) {
@@ -195,11 +287,16 @@ Pager* pager_open(const char* filename) {

 Table* db_open(const char* filename) {
   Pager* pager = pager_open(filename);
-  uint32_t num_rows = pager->file_length / ROW_SIZE;

   Table* table = malloc(sizeof(Table));
   table->pager = pager;
-  table->num_rows = num_rows;
+  table->root_page_num = 0;
+
+  if (pager->num_pages == 0) {
+    // 新しいデータベースファイル。ページ0をリーフノードとして初期化。
+    void* root_node = get_page(pager, 0);
+    initialize_leaf_node(root_node);
+  }

   return table;
 }
@@ -234,7 +331,7 @@ void close_input_buffer(InputBuffer* input_buffer) {
     free(input_buffer);
 }

-void pager_flush(Pager* pager, uint32_t page_num, uint32_t size) {
+void pager_flush(Pager* pager, uint32_t page_num) {
   if (pager->pages[page_num] == NULL) {
     printf("Tried to flush null page\n");
     exit(EXIT_FAILURE);
@@ -242,7 +337,7 @@ void pager_flush(Pager* pager, uint32_t page_num, uint32_t size) {
@@ -249,7 +346,7 @@ void pager_flush(Pager* pager, uint32_t page_num, uint32_t size) {
   }

   ssize_t bytes_written =
-      write(pager->file_descriptor, pager->pages[page_num], size);
+      write(pager->file_descriptor, pager->pages[page_num], PAGE_SIZE);

   if (bytes_written == -1) {
     printf("Error writing: %d\n", errno);
@@ -252,29 +347,16 @@ void pager_flush(Pager* pager, uint32_t page_num, uint32_t size) {
@@ -260,29 +357,16 @@ void pager_flush(Pager* pager, uint32_t page_num, uint32_t size) {

 void db_close(Table* table) {
   Pager* pager = table->pager;
-  uint32_t num_full_pages = table->num_rows / ROWS_PER_PAGE;

-  for (uint32_t i = 0; i < num_full_pages; i++) {
+  for (uint32_t i = 0; i < pager->num_pages; i++) {
     if (pager->pages[i] == NULL) {
       continue;
     }
-    pager_flush(pager, i, PAGE_SIZE);
+    pager_flush(pager, i);
     free(pager->pages[i]);
     pager->pages[i] = NULL;
   }

-  // ファイル末尾に書き込むべき不完全なページがある場合がある
-  // B-treeに切り替えた後は不要になる
-  uint32_t num_additional_rows = table->num_rows % ROWS_PER_PAGE;
-  if (num_additional_rows > 0) {
-    uint32_t page_num = num_full_pages;
-    if (pager->pages[page_num] != NULL) {
-      pager_flush(pager, page_num, num_additional_rows * ROW_SIZE);
-      free(pager->pages[page_num]);
-      pager->pages[page_num] = NULL;
-    }
-  }
-
   int result = close(pager->file_descriptor);
   if (result == -1) {
     printf("Error closing db file.\n");
@@ -305,6 +389,14 @@ MetaCommandResult do_meta_command(InputBuffer* input_buffer, Table *table) {
   if (strcmp(input_buffer->buffer, ".exit") == 0) {
     db_close(table);
     exit(EXIT_SUCCESS);
+  } else if (strcmp(input_buffer->buffer, ".btree") == 0) {
+    printf("Tree:\n");
+    print_leaf_node(get_page(table->pager, 0));
+    return META_COMMAND_SUCCESS;
+  } else if (strcmp(input_buffer->buffer, ".constants") == 0) {
+    printf("Constants:\n");
+    print_constants();
+    return META_COMMAND_SUCCESS;
   } else {
     return META_COMMAND_UNRECOGNIZED_COMMAND;
   }
@@ -354,16 +446,39 @@ PrepareResult prepare_statement(InputBuffer* input_buffer,
   return PREPARE_UNRECOGNIZED_STATEMENT;
 }

+void leaf_node_insert(Cursor* cursor, uint32_t key, Row* value) {
+  void* node = get_page(cursor->table->pager, cursor->page_num);
+
+  uint32_t num_cells = *leaf_node_num_cells(node);
+  if (num_cells >= LEAF_NODE_MAX_CELLS) {
+    // ノードがいっぱい
+    printf("Need to implement splitting a leaf node.\n");
+    exit(EXIT_FAILURE);
+  }
+
+  if (cursor->cell_num < num_cells) {
+    // 新しいセルのためにスペースを空ける
+    for (uint32_t i = num_cells; i > cursor->cell_num; i--) {
+      memcpy(leaf_node_cell(node, i), leaf_node_cell(node, i - 1),
+             LEAF_NODE_CELL_SIZE);
+    }
+  }
+
+  *(leaf_node_num_cells(node)) += 1;
+  *(leaf_node_key(node, cursor->cell_num)) = key;
+  serialize_row(value, leaf_node_value(node, cursor->cell_num));
+}
+
 ExecuteResult execute_insert(Statement* statement, Table* table) {
-  if (table->num_rows >= TABLE_MAX_ROWS) {
+  void* node = get_page(table->pager, table->root_page_num);
+  if ((*leaf_node_num_cells(node) >= LEAF_NODE_MAX_CELLS)) {
     return EXECUTE_TABLE_FULL;
   }

   Row* row_to_insert = &(statement->row_to_insert);
   Cursor* cursor = table_end(table);

-  serialize_row(row_to_insert, cursor_value(cursor));
-  table->num_rows += 1;
+  leaf_node_insert(cursor, row_to_insert->id, row_to_insert);

   free(cursor);
```

テストの差分：
```diff
+  it 'allows printing out the structure of a one-node btree' do
+    script = [3, 1, 2].map do |i|
+      "insert #{i} user#{i} person#{i}@example.com"
+    end
+    script << ".btree"
+    script << ".exit"
+    result = run_script(script)
+
+    expect(result).to match_array([
+      "db > Executed.",
+      "db > Executed.",
+      "db > Executed.",
+      "db > Tree:",
+      "leaf (size 3)",
+      "  - 0 : 3",
+      "  - 1 : 1",
+      "  - 2 : 2",
+      "db > "
+    ])
+  end
+
+  it 'prints constants' do
+    script = [
+      ".constants",
+      ".exit",
+    ]
+    result = run_script(script)
+
+    expect(result).to match_array([
+      "db > Constants:",
+      "ROW_SIZE: 293",
+      "COMMON_NODE_HEADER_SIZE: 6",
+      "LEAF_NODE_HEADER_SIZE: 10",
+      "LEAF_NODE_CELL_SIZE: 297",
+      "LEAF_NODE_SPACE_FOR_CELLS: 4086",
+      "LEAF_NODE_MAX_CELLS: 13",
+      "db > ",
+    ])
+  end
 end
```

---

<div align="center">

[← 前へ: Part 7 - B-Tree入門](./part7.md) | [次へ: Part 9 - 二分探索と重複キー →](./part9.md)

</div>
