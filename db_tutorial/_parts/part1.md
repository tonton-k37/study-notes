---
title: Part 1 - イントロダクションとREPLの構築
date: 2017-08-30
---

Web開発者として、仕事で毎日リレーショナルデータベースを使っているが、自分にとってはブラックボックスだ。いくつか疑問がある：
- データはどのような形式で保存されている？（メモリ上とディスク上で）
- いつメモリからディスクに移動される？
- なぜテーブルごとに主キーは1つだけなのか？
- トランザクションのロールバックはどのように動作する？
- インデックスはどのようなフォーマットで保存される？
- フルテーブルスキャンはいつ、どのように行われる？
- プリペアドステートメントはどのような形式で保存される？

つまり、データベースはどのように**動いている**のか？

それを理解するために、データベースをゼロから書くことにした。MySQLやPostgreSQLに比べて小さく機能が少ないsqliteをモデルにしている。おかげで理解しやすい。データベース全体が1つのファイルに保存される！

# Sqlite

sqliteの内部構造については、公式サイトに[多くのドキュメント](https://www.sqlite.org/arch.html)がある。また、[SQLite Database System: Design and Implementation](https://play.google.com/store/books/details?id=9Z6IQQnX1JEC)という本も参考にしている。

{% include image.html url="assets/images/arch1.gif" description="sqlite architecture (https://www.sqlite.org/zipvfs/doc/trunk/www/howitworks.wiki)" %}

クエリは、データを取得・変更するためにコンポーネントのチェーンを順番に通過する。**フロントエンド**は以下で構成される：
- トークナイザ
- パーサ
- コードジェネレータ

フロントエンドへの入力はSQLクエリ。出力はsqlite仮想マシンのバイトコード（本質的にはデータベースを操作できるコンパイル済みプログラム）。

_バックエンド_ は以下で構成される：
- 仮想マシン
- B-tree
- ページャ
- OSインターフェース

**仮想マシン**はフロントエンドが生成したバイトコードを命令として受け取る。そして1つ以上のテーブルやインデックスに対して操作を行う。各テーブルやインデックスはB-treeというデータ構造に格納されている。VMは本質的にバイトコード命令の種類に応じた大きなswitch文である。

各**B-tree**は多数のノードで構成される。各ノードの長さは1ページ分。B-treeはページャにコマンドを発行して、ディスクからページを取得したり、ディスクに書き戻したりできる。

**ページャ**はデータのページの読み書きコマンドを受け取る。データベースファイルの適切なオフセットで読み書きする役割を担う。また、最近アクセスしたページのキャッシュをメモリ上に保持し、それらのページをいつディスクに書き戻す必要があるかを判断する。

**OSインターフェース**はsqliteがコンパイルされたOSによって異なるレイヤー。このチュートリアルでは複数プラットフォームのサポートは行わない。

[千里の道も一歩から](https://en.wiktionary.org/wiki/a_journey_of_a_thousand_miles_begins_with_a_single_step)。まずはもう少し基本的なところ、REPLから始めよう。

## シンプルなREPLを作る

sqliteをコマンドラインから起動すると、読み取り-実行-表示ループ（REPL）が始まる：

```shell
~ sqlite3
SQLite version 3.16.0 2016-11-04 19:09:39
Enter ".help" for usage hints.
Connected to a transient in-memory database.
Use ".open FILENAME" to reopen on a persistent database.
sqlite> create table users (id int, username varchar(255), email varchar(255));
sqlite> .tables
users
sqlite> .exit
~
```

そのために、main関数にプロンプトを表示し、入力行を取得し、その入力行を処理する無限ループを持たせる：

```c
int main(int argc, char* argv[]) {
  InputBuffer* input_buffer = new_input_buffer();
  while (true) {
    print_prompt();
    read_input(input_buffer);

    if (strcmp(input_buffer->buffer, ".exit") == 0) {
      close_input_buffer(input_buffer);
      exit(EXIT_SUCCESS);
    } else {
      printf("Unrecognized command '%s'.\n", input_buffer->buffer);
    }
  }
}
```

`InputBuffer`は[getline()](http://man7.org/linux/man-pages/man3/getline.3.html)とのやり取りで保存が必要な状態の小さなラッパーとして定義する（詳しくは後述）。
```c
typedef struct {
  char* buffer;
  size_t buffer_length;
  ssize_t input_length;
} InputBuffer;

InputBuffer* new_input_buffer() {
  InputBuffer* input_buffer = (InputBuffer*)malloc(sizeof(InputBuffer));
  input_buffer->buffer = NULL;
  input_buffer->buffer_length = 0;
  input_buffer->input_length = 0;

  return input_buffer;
}
```

次に、`print_prompt()`はユーザーにプロンプトを表示する。入力の各行を読み取る前にこれを行う。

```c
void print_prompt() { printf("db > "); }
```

入力行を読み取るには[getline()](http://man7.org/linux/man-pages/man3/getline.3.html)を使う：
```c
ssize_t getline(char **lineptr, size_t *n, FILE *stream);
```
`lineptr`：読み取った行を格納するバッファへのポインタ変数へのポインタ。`NULL`に設定すると`getline`がmallocで確保し、コマンドが失敗してもユーザーが解放する必要がある。

`n`：確保されたバッファのサイズを保存する変数へのポインタ。

`stream`：読み取り元の入力ストリーム。ここでは標準入力から読み取る。

`戻り値`：読み取ったバイト数。バッファのサイズより小さい場合がある。

`getline`に、読み取った行を`input_buffer->buffer`に、確保されたバッファのサイズを`input_buffer->buffer_length`に格納するよう指示する。戻り値は`input_buffer->input_length`に格納する。

`buffer`は最初はnullなので、`getline`は入力行を保持するのに十分なメモリを確保し、`buffer`をそこに向ける。

```c
void read_input(InputBuffer* input_buffer) {
  ssize_t bytes_read =
      getline(&(input_buffer->buffer), &(input_buffer->buffer_length), stdin);

  if (bytes_read <= 0) {
    printf("Error reading input\n");
    exit(EXIT_FAILURE);
  }

  // 末尾の改行を無視
  input_buffer->input_length = bytes_read - 1;
  input_buffer->buffer[bytes_read - 1] = 0;
}
```

次に、`InputBuffer *`のインスタンスと、対応する構造体の`buffer`要素（`read_input`内で`getline`が`input_buffer->buffer`のメモリを確保する）に割り当てられたメモリを解放する関数を定義する。

```c
void close_input_buffer(InputBuffer* input_buffer) {
    free(input_buffer->buffer);
    free(input_buffer);
}
```

最後に、コマンドをパースして実行する。現時点で認識されるコマンドは`.exit`のみで、プログラムを終了する。それ以外はエラーメッセージを出力してループを続ける。

```c
if (strcmp(input_buffer->buffer, ".exit") == 0) {
  close_input_buffer(input_buffer);
  exit(EXIT_SUCCESS);
} else {
  printf("Unrecognized command '%s'.\n", input_buffer->buffer);
}
```

試してみよう！
```shell
~ ./db
db > .tables
Unrecognized command '.tables'.
db > .exit
~
```

よし、動くREPLができた。次のパートでは、コマンド言語の開発を始める。その前に、このパートのプログラム全体を示す：

```c
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  char* buffer;
  size_t buffer_length;
  ssize_t input_length;
} InputBuffer;

InputBuffer* new_input_buffer() {
  InputBuffer* input_buffer = malloc(sizeof(InputBuffer));
  input_buffer->buffer = NULL;
  input_buffer->buffer_length = 0;
  input_buffer->input_length = 0;

  return input_buffer;
}

void print_prompt() { printf("db > "); }

void read_input(InputBuffer* input_buffer) {
  ssize_t bytes_read =
      getline(&(input_buffer->buffer), &(input_buffer->buffer_length), stdin);

  if (bytes_read <= 0) {
    printf("Error reading input\n");
    exit(EXIT_FAILURE);
  }

  // Ignore trailing newline
  input_buffer->input_length = bytes_read - 1;
  input_buffer->buffer[bytes_read - 1] = 0;
}

void close_input_buffer(InputBuffer* input_buffer) {
    free(input_buffer->buffer);
    free(input_buffer);
}

int main(int argc, char* argv[]) {
  InputBuffer* input_buffer = new_input_buffer();
  while (true) {
    print_prompt();
    read_input(input_buffer);

    if (strcmp(input_buffer->buffer, ".exit") == 0) {
      close_input_buffer(input_buffer);
      exit(EXIT_SUCCESS);
    } else {
      printf("Unrecognized command '%s'.\n", input_buffer->buffer);
    }
  }
}
```
