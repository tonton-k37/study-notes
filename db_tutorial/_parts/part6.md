---
title: Part 6 - カーソルの抽象化
date: 2017-09-10
---

前回より短いパートになるはずだ。B-Treeの実装を始めやすくするために、少しリファクタリングする。

テーブル内の位置を表す`Cursor`オブジェクトを追加する。カーソルで行いたい操作：

- テーブルの先頭にカーソルを作成する
- テーブルの末尾にカーソルを作成する
- カーソルが指す行にアクセスする
- カーソルを次の行に進める

これらが今回実装する動作だ。後で追加したい操作：

- カーソルが指す行を削除する
- カーソルが指す行を変更する
- 指定されたIDでテーブルを検索し、そのIDの行を指すカーソルを作成する

早速、`Cursor`型を定義する：

```diff
+typedef struct {
+  Table* table;
+  uint32_t row_num;
+  bool end_of_table;  // 最後の要素の1つ先の位置を示す
+} Cursor;
```

現在のテーブルデータ構造では、テーブル内の位置を特定するのに必要なのは行番号だけだ。

カーソルは自分が属するテーブルへの参照も持つ（カーソル関数がカーソルだけをパラメータとして受け取れるようにするため）。

最後に、`end_of_table`というブーリアン値がある。テーブルの末尾を超えた位置（行を挿入したい場所になり得る）を表現するためだ。

`table_start()`と`table_end()`で新しいカーソルを作成する：

```diff
+Cursor* table_start(Table* table) {
+  Cursor* cursor = malloc(sizeof(Cursor));
+  cursor->table = table;
+  cursor->row_num = 0;
+  cursor->end_of_table = (table->num_rows == 0);
+
+  return cursor;
+}
+
+Cursor* table_end(Table* table) {
+  Cursor* cursor = malloc(sizeof(Cursor));
+  cursor->table = table;
+  cursor->row_num = table->num_rows;
+  cursor->end_of_table = true;
+
+  return cursor;
+}
```

`row_slot()`関数は`cursor_value()`になる。カーソルが示す位置へのポインタを返す：

```diff
-void* row_slot(Table* table, uint32_t row_num) {
+void* cursor_value(Cursor* cursor) {
+  uint32_t row_num = cursor->row_num;
   uint32_t page_num = row_num / ROWS_PER_PAGE;
-  void* page = get_page(table->pager, page_num);
+  void* page = get_page(cursor->table->pager, page_num);
   uint32_t row_offset = row_num % ROWS_PER_PAGE;
   uint32_t byte_offset = row_offset * ROW_SIZE;
   return page + byte_offset;
 }
```

現在のテーブル構造でカーソルを進めるのは、行番号をインクリメントするだけで済む。B-treeではもう少し複雑になる。

```diff
+void cursor_advance(Cursor* cursor) {
+  cursor->row_num += 1;
+  if (cursor->row_num >= cursor->table->num_rows) {
+    cursor->end_of_table = true;
+  }
+}
```

最後に、「仮想マシン」のメソッドをカーソル抽象化を使うように変更する。行を挿入する時は、テーブル末尾にカーソルを開き、そのカーソル位置に書き込み、カーソルを閉じる。

```diff
   Row* row_to_insert = &(statement->row_to_insert);
+  Cursor* cursor = table_end(table);

-  serialize_row(row_to_insert, row_slot(table, table->num_rows));
+  serialize_row(row_to_insert, cursor_value(cursor));
   table->num_rows += 1;

+  free(cursor);
+
   return EXECUTE_SUCCESS;
 }
 ```

テーブルの全行を選択する時は、テーブル先頭にカーソルを開き、行を表示し、カーソルを次の行に進める。テーブルの末尾に到達するまで繰り返す。

```diff
 ExecuteResult execute_select(Statement* statement, Table* table) {
+  Cursor* cursor = table_start(table);
+
   Row row;
-  for (uint32_t i = 0; i < table->num_rows; i++) {
-    deserialize_row(row_slot(table, i), &row);
+  while (!(cursor->end_of_table)) {
+    deserialize_row(cursor_value(cursor), &row);
     print_row(&row);
+    cursor_advance(cursor);
   }
+
+  free(cursor);
+
   return EXECUTE_SUCCESS;
 }
 ```

以上だ！前述の通り、これはB-Treeとしてテーブルデータ構造を書き換える際に役立つ、短いリファクタリングだった。`execute_select()`と`execute_insert()`は、テーブルの保存方法について一切想定せずに、カーソルだけを通じてテーブルとやり取りできるようになった。

このパートの完全な差分：
```diff
@@ -78,6 +78,13 @@ struct {
 } Table;

+typedef struct {
+  Table* table;
+  uint32_t row_num;
+  bool end_of_table; // 最後の要素の1つ先の位置を示す
+} Cursor;
+
 void print_row(Row* row) {
     printf("(%d, %s, %s)\n", row->id, row->username, row->email);
 }
@@ -126,12 +133,38 @@ void* get_page(Pager* pager, uint32_t page_num) {
     return pager->pages[page_num];
 }

-void* row_slot(Table* table, uint32_t row_num) {
-  uint32_t page_num = row_num / ROWS_PER_PAGE;
-  void *page = get_page(table->pager, page_num);
-  uint32_t row_offset = row_num % ROWS_PER_PAGE;
-  uint32_t byte_offset = row_offset * ROW_SIZE;
-  return page + byte_offset;
+Cursor* table_start(Table* table) {
+  Cursor* cursor = malloc(sizeof(Cursor));
+  cursor->table = table;
+  cursor->row_num = 0;
+  cursor->end_of_table = (table->num_rows == 0);
+
+  return cursor;
+}
+
+Cursor* table_end(Table* table) {
+  Cursor* cursor = malloc(sizeof(Cursor));
+  cursor->table = table;
+  cursor->row_num = table->num_rows;
+  cursor->end_of_table = true;
+
+  return cursor;
+}
+
+void* cursor_value(Cursor* cursor) {
+  uint32_t row_num = cursor->row_num;
+  uint32_t page_num = row_num / ROWS_PER_PAGE;
+  void *page = get_page(cursor->table->pager, page_num);
+  uint32_t row_offset = row_num % ROWS_PER_PAGE;
+  uint32_t byte_offset = row_offset * ROW_SIZE;
+  return page + byte_offset;
+}
+
+void cursor_advance(Cursor* cursor) {
+  cursor->row_num += 1;
+  if (cursor->row_num >= cursor->table->num_rows) {
+    cursor->end_of_table = true;
+  }
 }

 Pager* pager_open(const char* filename) {
@@ -327,19 +360,28 @@ ExecuteResult execute_insert(Statement* statement, Table* table) {
     }

   Row* row_to_insert = &(statement->row_to_insert);
+  Cursor* cursor = table_end(table);

-  serialize_row(row_to_insert, row_slot(table, table->num_rows));
+  serialize_row(row_to_insert, cursor_value(cursor));
   table->num_rows += 1;

+  free(cursor);
+
   return EXECUTE_SUCCESS;
 }

 ExecuteResult execute_select(Statement* statement, Table* table) {
+  Cursor* cursor = table_start(table);
+
   Row row;
-  for (uint32_t i = 0; i < table->num_rows; i++) {
-     deserialize_row(row_slot(table, i), &row);
+  while (!(cursor->end_of_table)) {
+     deserialize_row(cursor_value(cursor), &row);
      print_row(&row);
+     cursor_advance(cursor);
   }
+
+  free(cursor);
+
   return EXECUTE_SUCCESS;
 }
```
