---
title: Part 2 - 世界で最もシンプルなSQLコンパイラと仮想マシン
date: 2017-08-31
---

> 🎯 **このパートを学ぶ理由**: SQLがどう解釈・実行されるかの全体像。フロントエンド（パーサ）とバックエンド（仮想マシン）を分離することで、実際のDBエンジンと同じ設計思想を体験する。
> **前提知識**: Part 1（REPL）

sqliteのクローンを作っている。sqliteの「フロントエンド」は、文字列をパースしてバイトコードと呼ばれる内部表現を出力するSQLコンパイラだ。

このバイトコードは仮想マシンに渡されて実行される。

{% include image.html url="assets/images/arch2.gif" description="SQLite Architecture (https://www.sqlite.org/arch.html)" %}

このように2つのステップに分けることにはいくつかの利点がある：
- 各部分の複雑さが減る（例：仮想マシンは構文エラーを心配する必要がない）
- よく使うクエリを一度コンパイルしてバイトコードをキャッシュすることでパフォーマンスが向上する

これを踏まえて、`main`関数をリファクタリングし、2つの新しいキーワードをサポートしよう：

```diff
 int main(int argc, char* argv[]) {
   InputBuffer* input_buffer = new_input_buffer();
   while (true) {
     print_prompt();
     read_input(input_buffer);

-    if (strcmp(input_buffer->buffer, ".exit") == 0) {
-      exit(EXIT_SUCCESS);
-    } else {
-      printf("Unrecognized command '%s'.\n", input_buffer->buffer);
+    if (input_buffer->buffer[0] == '.') {
+      switch (do_meta_command(input_buffer)) {
+        case (META_COMMAND_SUCCESS):
+          continue;
+        case (META_COMMAND_UNRECOGNIZED_COMMAND):
+          printf("Unrecognized command '%s'\n", input_buffer->buffer);
+          continue;
+      }
     }
+
+    Statement statement;
+    switch (prepare_statement(input_buffer, &statement)) {
+      case (PREPARE_SUCCESS):
+        break;
+      case (PREPARE_UNRECOGNIZED_STATEMENT):
+        printf("Unrecognized keyword at start of '%s'.\n",
+               input_buffer->buffer);
+        continue;
+    }
+
+    execute_statement(&statement);
+    printf("Executed.\n");
   }
 }
```

`.exit`のようなSQL以外の文は「メタコマンド」と呼ばれる。すべてドットで始まるので、それを検出して別の関数で処理する。

次に、入力行を文（statement）の内部表現に変換するステップを追加する。これがsqliteフロントエンドの簡易版だ。

最後に、プリペアドステートメントを`execute_statement`に渡す。この関数が最終的に仮想マシンになる。

新しい2つの関数が成功または失敗を示すenumを返すことに注目：

```c
typedef enum {
  META_COMMAND_SUCCESS,
  META_COMMAND_UNRECOGNIZED_COMMAND
} MetaCommandResult;

typedef enum { PREPARE_SUCCESS, PREPARE_UNRECOGNIZED_STATEMENT } PrepareResult;
```

「認識できないステートメント」？例外のように聞こえる。例外を使うのは好みではない（そもそもCは例外をサポートしていない）ので、実用的な場面ではenumの結果コードを使う。Cコンパイラはswitch文でenumのメンバーを処理していないと警告してくれるので、関数のすべての結果を処理していることをある程度確信できる。今後さらに多くの結果コードが追加される予定だ。

`do_meta_command`は既存の機能をラップし、今後のコマンド追加の余地を残している：

```c
MetaCommandResult do_meta_command(InputBuffer* input_buffer) {
  if (strcmp(input_buffer->buffer, ".exit") == 0) {
    exit(EXIT_SUCCESS);
  } else {
    return META_COMMAND_UNRECOGNIZED_COMMAND;
  }
}
```

現時点の「プリペアドステートメント」は、2つの値を持つenumだけを含む。ステートメントにパラメータを許可するようになると、より多くのデータを含むようになる：

```c
typedef enum { STATEMENT_INSERT, STATEMENT_SELECT } StatementType;

typedef struct {
  StatementType type;
} Statement;
```

`prepare_statement`（「SQLコンパイラ」）はまだSQLを理解しない。実際、2つの単語しか理解しない：
```c
PrepareResult prepare_statement(InputBuffer* input_buffer,
                                Statement* statement) {
  if (strncmp(input_buffer->buffer, "insert", 6) == 0) {
    statement->type = STATEMENT_INSERT;
    return PREPARE_SUCCESS;
  }
  if (strcmp(input_buffer->buffer, "select") == 0) {
    statement->type = STATEMENT_SELECT;
    return PREPARE_SUCCESS;
  }

  return PREPARE_UNRECOGNIZED_STATEMENT;
}
```

「insert」には`strncmp`を使っていることに注意。「insert」キーワードの後にデータが続くため（例：`insert 1 cstack foo@bar.com`）。

最後に、`execute_statement`にはいくつかのスタブがある：
```c
void execute_statement(Statement* statement) {
  switch (statement->type) {
    case (STATEMENT_INSERT):
      printf("This is where we would do an insert.\n");
      break;
    case (STATEMENT_SELECT):
      printf("This is where we would do a select.\n");
      break;
  }
}
```

まだ何も間違いが起こりえないので、エラーコードは返していない。

このリファクタリングにより、2つの新しいキーワードを認識できるようになった！
```command-line
~ ./db
db > insert foo bar
This is where we would do an insert.
Executed.
db > delete foo
Unrecognized keyword at start of 'delete foo'.
db > select
This is where we would do a select.
Executed.
db > .tables
Unrecognized command '.tables'
db > .exit
~
```

データベースの骨格ができてきた...データを保存できたら素晴らしいだろう。次のパートでは`insert`と`select`を実装し、世界最悪のデータストアを作る。その前に、このパートの差分全体を示す：

```diff
@@ -10,6 +10,23 @@ struct InputBuffer_t {
 } InputBuffer;
 
+typedef enum {
+  META_COMMAND_SUCCESS,
+  META_COMMAND_UNRECOGNIZED_COMMAND
+} MetaCommandResult;
+
+typedef enum { PREPARE_SUCCESS, PREPARE_UNRECOGNIZED_STATEMENT } PrepareResult;
+
+typedef enum { STATEMENT_INSERT, STATEMENT_SELECT } StatementType;
+
+typedef struct {
+  StatementType type;
+} Statement;
+
 InputBuffer* new_input_buffer() {
   InputBuffer* input_buffer = malloc(sizeof(InputBuffer));
   input_buffer->buffer = NULL;
@@ -40,17 +57,67 @@ void close_input_buffer(InputBuffer* input_buffer) {
     free(input_buffer);
 }
 
+MetaCommandResult do_meta_command(InputBuffer* input_buffer) {
+  if (strcmp(input_buffer->buffer, ".exit") == 0) {
+    close_input_buffer(input_buffer);
+    exit(EXIT_SUCCESS);
+  } else {
+    return META_COMMAND_UNRECOGNIZED_COMMAND;
+  }
+}
+
+PrepareResult prepare_statement(InputBuffer* input_buffer,
+                                Statement* statement) {
+  if (strncmp(input_buffer->buffer, "insert", 6) == 0) {
+    statement->type = STATEMENT_INSERT;
+    return PREPARE_SUCCESS;
+  }
+  if (strcmp(input_buffer->buffer, "select") == 0) {
+    statement->type = STATEMENT_SELECT;
+    return PREPARE_SUCCESS;
+  }
+
+  return PREPARE_UNRECOGNIZED_STATEMENT;
+}
+
+void execute_statement(Statement* statement) {
+  switch (statement->type) {
+    case (STATEMENT_INSERT):
+      printf("This is where we would do an insert.\n");
+      break;
+    case (STATEMENT_SELECT):
+      printf("This is where we would do a select.\n");
+      break;
+  }
+}
+
 int main(int argc, char* argv[]) {
   InputBuffer* input_buffer = new_input_buffer();
   while (true) {
     print_prompt();
     read_input(input_buffer);
 
-    if (strcmp(input_buffer->buffer, ".exit") == 0) {
-      close_input_buffer(input_buffer);
-      exit(EXIT_SUCCESS);
-    } else {
-      printf("Unrecognized command '%s'.\n", input_buffer->buffer);
+    if (input_buffer->buffer[0] == '.') {
+      switch (do_meta_command(input_buffer)) {
+        case (META_COMMAND_SUCCESS):
+          continue;
+        case (META_COMMAND_UNRECOGNIZED_COMMAND):
+          printf("Unrecognized command '%s'\n", input_buffer->buffer);
+          continue;
+      }
     }
+
+    Statement statement;
+    switch (prepare_statement(input_buffer, &statement)) {
+      case (PREPARE_SUCCESS):
+        break;
+      case (PREPARE_UNRECOGNIZED_STATEMENT):
+        printf("Unrecognized keyword at start of '%s'.\n",
+               input_buffer->buffer);
+        continue;
+    }
+
+    execute_statement(&statement);
+    printf("Executed.\n");
   }
 }
```

---

<div align="center">

[← 前へ: Part 1 - REPL](./part1.md) | [次へ: Part 3 - インメモリDB →](./part3.md)

</div>
